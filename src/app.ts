import { ok, strictEqual } from "assert";
import Axios, { AxiosStatic } from "axios";
import {
    Client,
    DMChannel,
    GuildMember,
    MessageAttachment,
    NewsChannel,
    TextChannel,
    VoiceChannel
} from "discord.js";
import { config } from "dotenv";
import { basename } from "path";
import { boolean, int } from "random";
import { Quotes } from "./Quotes";

interface ICommand {
    name: string;
    description: string;
    args?: IArgument[];
    requiredArgsCount: number;
    call: (args: ICallerArgs) => Promise<void>;
}

interface IArgument {
    name: string;
    description: string;
    defaultValue?: string;
    anyArg?: boolean;
}
interface ICallerContext {
    sender: GuildMember;
    channel: TextChannel | DMChannel | NewsChannel;
    attachments: MessageAttachment[];
}
interface ICallerArgs {
    context: ICallerContext;
    [key: string]: string | ICallerContext | string[];
}

const commands: ICommand[] = [
    {
        name: "roll",
        description: "Roll a dice between the to given numbers or 0 and 100. Example \"-roll 1 12\" rolls a D12.",
        args: [
            { name: "min", description: "Minimum roll value or range", defaultValue: "0" },
            { name: "max", description: "Maximum roll value", defaultValue: "100" }
        ],
        requiredArgsCount: 0,
        call: roll
    },
    {
        name: "flip",
        description: "Flip a coin.",
        requiredArgsCount: 0,
        call: flipCoin
    },
    {
        name: "roulette",
        description: "Selects a random user in the current voice channel.",
        requiredArgsCount: 0,
        call: roulette
    },
    {
        name: "choose",
        description: "Chooses a random option from the given list." +
            "Example \"-choose wine cheese\" chooses between wine and cheese.",
        args: [{ name: "options", description: "A list of options to choose from.", anyArg: true }],
        requiredArgsCount: 1,
        call: chooseOption
    },
    {
        name: "modules",
        description: "Returns the list of quote modules currently loaded.",
        requiredArgsCount: 0,
        call: getModules
    },
    {
        name: "quote",
        description:
            "Plays the quote with the given name or a random quote if no name was given." +
            "Example \"-quote tacticalnuke\"",
        args: [{ name: "quote", description: "Name of the quote to play." }],
        requiredArgsCount: 0,
        call: playQuote
    },
    {
        name: "q",
        description:
            "Plays the quote with the given name or a random quote if no name was given." +
            "Example \"-q tacticalnuke\"",
        args: [{ name: "quote", description: "Name of the quote to play." }],
        requiredArgsCount: 0,
        call: playQuote
    },
    {
        name: "projectQuote",
        description: "Internal use for webhooks",
        args: [
            { name: "quote", description: "Name of the quote to play" },
            { name: "nickname", description: "Nickname of the person in whose channel the quote will be played" }
        ],
        requiredArgsCount: 2,
        call: projectQuote
    },
    {
        name: "rquote",
        description:
            "Play a random quote or when given the name of a module a random quote from the module.",
        args: [{ name: "moduleName", description: "Name of the module to quote from." }],
        requiredArgsCount: 0,
        call: playRandomQuote
    },
    {
        name: "mlist",
        description:
            "Lists all quotes in the given module. A second parameter can be used to flip through the pages.",
        args: [
            { name: "moduleName", description: "The module you want to search through.", },
            { name: "page", description: "The page of the module list to show." }
        ],
        requiredArgsCount: 1,
        call: listModule
    },
    {
        name: "qupload",
        description: "Uploads the attached files as new quotes in the selected module",
        args: [{ name: "moduleName", description: "The module which to quote(s) will be added to." }],
        requiredArgsCount: 1,
        call: uploadQuote
    }
];

let quotes: Promise<Quotes>;
config();
quotes = Quotes.indexDir("content/quotes/");
quotes.catch((err) => console.error(err));
const client = new Client();
const token = process.env.TOKEN;
client.on("message", async (msg) => {
    if (!msg.content.startsWith("-")) {
        return;
    }
    const tokens = msg.content.split(" ");
    const commandName = tokens[0].substr(1);
    const command = commands.find((c) => c.name === commandName);
    if (command === undefined) {
        return;
    }

    const args = tokens.slice(1);
    if (args.length < command.requiredArgsCount) {
        msg.channel.send(`Command ${command.name} requires at least ${command.requiredArgsCount} arguments.`);
        return;
    }
    const callerArgs: ICallerArgs = {
        context: {
            attachments: Array.from(msg.attachments.values()),
            channel: msg.channel,
            sender: msg.member
        }
    };
    const commandArgs = !!command.args ? command.args : [];
    const anyArg = commandArgs.findIndex((arg) => arg.anyArg);
    ok(
        anyArg === -1 ||
        commandArgs.length - 1 === anyArg,
        `AnyArg has to be last argument in list. ${command.name}->${commandArgs[anyArg]}`);
    const namedArgs = args.slice(0, anyArg === -1 ? commandArgs.length : anyArg);
    ok(namedArgs.length <= commandArgs.length);
    // Add named arguments
    for (let index = 0; index < namedArgs.length; index++) {
        const arg = namedArgs[index];
        const argInfo = commandArgs[index];
        callerArgs[argInfo.name] = arg;
    }

    // Add remaining arguments to AnyArg if it exists.
    if (anyArg !== -1) {
        callerArgs[commandArgs[anyArg].name] = args.slice(anyArg);
    }

    try {
        await command.call(callerArgs);
    } catch (error) {
        console.error(`Caught error when running ${commandName}}:\n${error}\nContext:${JSON.stringify(callerArgs, null, 4)}`);
    }
});

client.login(token)
    .catch((err) => {
        console.error("Failed to login.");
        console.error(err);
        console.error("Exiting...");
        process.exit(-1);
    });

async function roll(args: { context: ICallerContext, min?: string, max?: string }) {
    const rangeArg = args.min !== undefined ? args.min.match("(\\d+)\-(\\d+)") : undefined;
    let a1: number;
    let a2: number;
    // Check if first argument was a range a of numbers
    if (rangeArg) {
        a1 = Number.parseInt(rangeArg[1]);
        a2 = Number.parseInt(rangeArg[2]);
    } else {
        a1 = Number.parseInt(args.min || "0");
        a2 = Number.parseInt(args.max || "100");
    }

    // Parse and sort parameters
    const [minNum, maxNum] = [a1, a2].sort((a, b) => a - b);
    const rand = int(minNum, maxNum);
    args.context.channel.send(`${args.context.sender.displayName} rolled ${rand} (${minNum} - ${maxNum}).`);
}

async function getModules(args: { context: ICallerContext }) {
    const modules = (await quotes).getModules().join(", ");
    args.context.channel.send(`Loaded modules: \n${modules}`);
}

async function playQuote(args: { context: ICallerContext, quote?: string }) {
    let soundFile: string;
    const name = args.quote;
    if (name === undefined) {
        soundFile = (await quotes).getRandomQuote();
        args.context.channel.send(`Playing random quote ${basename(soundFile)}.`);
    } else {
        soundFile = (await quotes).getQuote(name);
    }
    playSound(args.context.sender.voice.channel, soundFile);
}

async function playRandomQuote(args: { context: ICallerContext, moduleName?: string }) {
    const moduleName = args.moduleName;
    const channel = args.context.channel;
    const sender = args.context.sender;
    if (moduleName === undefined) {
        await playQuote({ context: args.context });
    } else {
        const soundFile = (await quotes).getRandomQuote(moduleName);
        if (soundFile === undefined) {
            channel.send(`No module ${moduleName} found.`);
            return;
        }
        channel.send(`Playing random quote ${basename(soundFile)} from ${moduleName}.`);
        playSound(sender.voice.channel, soundFile);
    }
}

async function projectQuote(args: { context: ICallerContext, quote: string, nickname: string }) {
    // Web-hooks aren't a sender
     if (!args.context.sender !== null) {
        args.context.channel.send("Quote projection can only be used by webhooks. Use -quote instead.")
    }

    const serverChannels = Array.from(client.channels.cache.values())
    const serverVoiceChannels = serverChannels
        .filter(channel => channel.type === "voice")
        .map(channel => channel as VoiceChannel)
    const projectTarget = serverVoiceChannels.find(channel => {
        const channelMembers = Array.from(channel.members.values())
        return channelMembers.some((member) => member.nickname === args.nickname)
    })

    if (projectTarget === undefined) {
        args.context.channel.send(`Target ${args.nickname} not found`);
    }

    const soundFile = (await quotes).getQuote(args.quote);

    if (soundFile === undefined) {
        args.context.channel.send(`Quote ${args.quote} not found`);
    }

    playSound(projectTarget, soundFile)
}

async function listModule(args: { context: ICallerContext, moduleName?: string, page?: string }) {
    const moduleName = args.moduleName;
    const channel = args.context.channel;
    const page = args.page;
    let pageNum = page === undefined ? 0 : Number.parseInt(page);
    const mod = (await quotes).getModuleQuotes(moduleName);
    if (mod === undefined) {
        channel.send(`Invalid module ${mod}`);
        return;
    }

    if (mod.length < pageNum * 20) {
        pageNum = Math.floor(Math.max(0, (mod.length / 20) - 1));
    }
    const pageStart = pageNum * 20;
    const pageEnd = Math.min(pageNum * 20 + 20, mod.length);
    const modQuotes = mod
        .sort()
        .slice(pageStart, pageEnd)
        .join(", ");
    channel.send(`Quotes in ${moduleName} (${pageStart}-${pageEnd}/${mod.length}): \n${modQuotes}`);
}

async function uploadQuote(args: { context: ICallerContext, moduleName?: string }) {
    const moduleName = args.moduleName;
    const attachments = args.context.attachments;
    const channel = args.context.channel;
    const quotesAwait = await quotes;
    if (attachments.length < 0) {
        channel.send("No sound file uploaded");
        return;
    } else if (!attachments.every((file) => quotesAwait.isValidQuoteFile(file.name))) {
        const filetypes = Array.from(quotesAwait.getAllowedExtensions()).join(",");
        channel.send(`Files can only be ${filetypes} and have names containing a-z and 0-9.`);
        return;
    } else if (!quotesAwait.getModules().some((m) => m === moduleName)) {
        channel.send(`There is no module ${moduleName}`);
        return;
    }

    const promises = attachments
        .filter((attachment) => {
            if (quotesAwait.getQuote(basename(attachment.name)) !== undefined) {
                channel.send(`Quote ${basename(attachment.name)} already exists!`);
                return false;
            } else if (attachment.size > 1 * 1000 * 1000) {
                channel.send(
                    `Quote ${attachment.name} is too large! Only file smaller than 1 MB are allowed.`);
                return false;
            } else {
                return true;
            }
        })
        .map((attachment) => {
            return new Promise(async () => {
                const soundFile = (await Axios.get(attachment.url, { responseType: "arraybuffer" })).data;
                await quotesAwait.addQuoteToModule(moduleName, { file: soundFile, name: attachment.name });
                channel.send(`Successfully added ${basename(attachment.name)} to ${moduleName}`);
            });
        });
    console.log(promises.length);
    await Promise.all(promises);
}

async function chooseOption(args: { context: ICallerContext, options: string[] }) {
    const options = args.options;
    if (options.length > 0) {
        const randIndex = int(0, options.length - 1);
        args.context.channel.send(`${options[randIndex]} was chosen for ${args.context.sender.displayName}!`);
    }
}

async function flipCoin(args: ICallerArgs) {
    const result = boolean() ? "Heads" : "Tails";
    args.context.channel.send(`${args.context.sender.displayName} flipped a coin and got ${result}!`);
}

async function roulette(args: ICallerArgs) {
    const members =
        Array.from(args.context.sender.voice.channel.members.values())
            .filter((member) => !member.user.bot);
    const randIndex = int(0, members.length - 1);
    args.context.channel.send(`${members[randIndex].displayName} was chosen!`);
}

function playSound(channel: VoiceChannel, file: string) {
    if (channel !== undefined) {
        channel.join()
            .then((connection) => { // Connection is an instance of VoiceConnection
                const dispatcher = connection.play(file);
            })
            .catch(console.error);
    }
}
