import { ActivityType, IntentsBitField } from "discord.js";
import { Bot } from "../core";
import config from "./config.json";

const bot = new Bot({
    prefix: "!",
    token: config.token,
    intents:
        IntentsBitField.Flags.GuildMessages |
        IntentsBitField.Flags.Guilds |
        IntentsBitField.Flags.MessageContent,
});

bot.statuses.setInterval(13_000);

bot.statuses.add({
    status: "dnd",
    name: "I'm busy!",
    type: ActivityType.Playing,
});

bot.statuses.add({
    status: "idle",
    name: "ok!",
    type: ActivityType.Playing,
});

bot.commands.messageCommand({
    name: "lol",
    code: "uwu $authorID $toLowerCase[HI]",
});

bot.events.add("onMessage");

bot.login();
