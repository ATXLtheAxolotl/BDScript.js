import { Booleans, Falsy, Truthy } from "../constants";
import { Compiler } from "../core";
import { getArgRange } from "../helpers";
import {
    ArgData,
    ArgType,
    CompiledFunctionData,
    ConditionData,
    DecideArgType,
    FunctionData,
    Nullable,
    ProcessedCompiledFunctionData,
    RuntimeErrorType,
    UnwrapTuple,
} from "../typings";
import { RuntimeError } from "./errors/RuntimeError";
import { Return } from "./Return";
import { ThisParserFunction } from "./ThisParserFunction";

export class ParserFunction<Args extends [...ArgData[]] = []> {
    readonly data: FunctionData<Args>;
    compiledData?: ProcessedCompiledFunctionData;

    constructor(data: FunctionData<Args>, compiledData?: CompiledFunctionData) {
        this.data = data;
        if (compiledData !== undefined) {
            this.compiledData = this.#process(compiledData);
        }
    }

    #process(data: CompiledFunctionData): ProcessedCompiledFunctionData {
        return {
            ...data,
            fields: data.fields.map((c) => ({
                ...c,
                overloads: c.overloads.map((c) => ParserFunction.from(c)),
            })),
        };
    }

    // Not finished
    getConditionField(_position: number): Nullable<ConditionData> {
        return "" as any;
    }

    static from(data: CompiledFunctionData): ParserFunction<ArgData[]> {
        const d = Compiler.getNativeFunction(data.name);
        return new ParserFunction(d, data);
    }

    static create<Args extends [...ArgData[]] = []>(
        raw: FunctionData<Args>,
        compiled?: CompiledFunctionData
    ): ParserFunction<Args> {
        return new this(raw, compiled);
    }

    toJSON() {
        return this.data;
    }

    async resolveArray(
        thisArg: ThisParserFunction
    ): Promise<Return<RuntimeError | UnwrapTuple<Args> | null>> {
        const args = new Array(this.data.args!.length) as UnwrapTuple<Args>;

        for (let i = 0, len = this.data.args!.length; i < len; i++) {
            const got = await this.resolveField(thisArg, i);
            if (!got.isSuccess()) {
                return got;
            }

            args[i] = got.value as UnwrapTuple<Args>[number];
        }

        return thisArg.success(args);
    }

    async resolveAll(
        thisArg: ThisParserFunction
    ): Promise<Return<RuntimeError | string | null>> {
        const arr = new Array(this.data.args!.length);

        for (let i = 0, len = this.compiledData?.fields.length!; i < len; i++) {
            const resolved = await this.resolveField(thisArg, i);
            if (!resolved.isSuccess()) {
                return resolved;
            }

            arr[i] = resolved.value;
        }

        return thisArg.success(arr.join(";"));
    }

    async resolveField<T extends number>(
        thisArg: ThisParserFunction,
        index: T
    ): Promise<Return<RuntimeError | null | UnwrapTuple<Args>[T]>> {
        const field = this.fieldAt(index);

        if (!field) return thisArg.success(null);

        const arr = new Array<string>(field.overloads.length);

        for (let i = 0, len = field.overloads.length; i < len; i++) {
            const overload = field.overloads[i];
            const got = await overload.data.execute.call(thisArg, overload);

            if (!got.isSuccess()) {
                return got;
            }

            arr[i] = got.value;
        }

        const arg = this.data.args![index];

        const total = field.executor!(arr);

        return (await this.parseArg(thisArg, arg, total)) as ReturnType<
            typeof this["resolveField"]
        >;
    }

    fieldAt(index: number) {
        return this.compiledData?.fields[index];
    }

    get image(): string {
        let inside = this.compiledData!.inside;
        if (!this.data.brackets || inside === null) return this.data.name;

        for (let i = 0, len = this.compiledData!.fields.length; i < len; i++) {
            const field = this.fieldAt(i)!;
            for (let x = 0, len2 = field.overloads.length; x < len2; x++) {
                const overload = field.overloads[x];
                inside = inside?.replaceAll(
                    overload.compiledData!.id,
                    overload.image
                );
            }
        }

        return `${this.data.name}[${inside}]`;
    }

    private async parseArg(
        thisArg: ThisParserFunction,
        arg: ArgData,
        received: string | undefined
    ): Promise<Return<RuntimeError | DecideArgType<ArgType, boolean>>> {
        let data: DecideArgType<ArgType, boolean> =
            received! ?? (await arg.default?.(thisArg)) ?? null;

        if (typeof data !== "string" && data !== undefined) {
            return thisArg.success(data);
        }

        if (!arg.optional && data === undefined) {
            return thisArg.createRuntimeError(RuntimeErrorType.Required, [
                arg.name,
                this.image,
            ]);
        }

        if (arg.optional && data === undefined) {
            return thisArg.success(null);
        }

        switch (arg.type) {
            case ArgType.Number: {
                const n = Number(data);

                if (isNaN(n)) {
                    return thisArg.createRuntimeError(RuntimeErrorType.Type, [
                        data,
                        ArgType[arg.type],
                        this.image,
                    ]);
                }

                if (
                    (arg.min !== undefined && n < arg.min) ||
                    (arg.max !== undefined && n > arg.max)
                ) {
                    return thisArg.createRuntimeError(
                        RuntimeErrorType.NumberRange,
                        [
                            arg.name,
                            ArgType[arg.type],
                            getArgRange(arg),
                            this.image,
                        ]
                    );
                }

                data = n;
                break;
            }

            case ArgType.String: {
                if (
                    (arg.min !== undefined && data.length < arg.min) ||
                    (arg.max !== undefined && data.length > arg.max)
                ) {
                    return thisArg.createRuntimeError(
                        RuntimeErrorType.StringRange,
                        [
                            arg.name,
                            ArgType[arg.type],
                            getArgRange(arg),
                            this.image,
                        ]
                    );
                }

                break;
            }

            case ArgType.Boolean: {
                if (!Booleans.includes(data)) {
                    return thisArg.createRuntimeError(RuntimeErrorType.Type, [
                        arg.name,
                        ArgType[arg.type],
                        this.image,
                    ]);
                }

                data = Truthy.includes(data);
                break;
            }
        }

        return thisArg.success(data);
    }
}
