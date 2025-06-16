/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Bot, type Context } from "grammy";
import { existsSync, mkdirSync } from "fs";
import {
    type Conversation,
    type ConversationFlavor,
    conversations,
    createConversation,
} from "@grammyjs/conversations";
import { join } from "path";
import { renameSync } from "fs";

type MyContext = Context & ConversationFlavor<Context>;

interface FolderPath {
    title: string;
    path: string;
}

function start(ctx: Context) {
    if (!isValidUser(ctx)) {
        return;
    }

    ctx.reply("Hi! Send me a video, and I will save it for you.");
}

function isValidUser(ctx: Context) {
    if (ctx.from && ACCESS_IDS.includes(ctx.from.id.toString())) {
        return true;
    } else {
        ctx.reply("Sorry, you are not authorized to use this bot.");
        return false;
    }
}

function getFolderPath(rootFolder: FolderPath, fileName: string) {
    const fileNameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");
    return join(rootFolder.path, fileNameWithoutExtension);
}

async function startDocumentDownload(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
    if (!isValidUser(ctx)) {
        return;
    }


    const menu = conversation.menu();

    FOLDERS.forEach(folder => {
        menu.text(folder.title, async (ctx1) => {
            try {
                if (!ctx.message || !ctx.message.document || !ctx.message.document.file_id) {
                    await ctx1.reply("No document found.");
                    return;
                }

                const filename = ctx.message!.document!.file_name || "";
                const folderPath = getFolderPath(folder, filename);
                const filePath = join(folderPath, filename);

                if (!existsSync(folderPath)) {
                    mkdirSync(folderPath, { recursive: true });
                }

                const message = await ctx.reply('Downloading...');
                messageIds.push(message.message_id);

                const file = await ctx.getFile();

                const adjustedFilePath = file.file_path!.replace("/var/lib/telegram-bot-api", "/data/telegram");

                renameSync(adjustedFilePath, filePath);

                await ctx.reply(`Downloaded: ${filename}`);
                ctx.deleteMessages(messageIds)

            } catch (error) {
                console.error("Error downloading file:", error);
                await ctx1.reply("An error occurred while downloading the file.");
            }
        });
    });

    const message = await ctx.reply("Select download location", {
        reply_markup: menu,
        reply_parameters: { message_id: ctx.message!.message_id },
    });

    const messageIds: number[] = [ctx.message!.message_id, message.message_id];

    await conversation.wait();
}

async function onDocument(ctx: MyContext): Promise<void> {
    if (
        ctx.message?.document &&
        ctx.message.document.mime_type &&
        ctx.message.document.mime_type.startsWith("video")
    ) {
        try {
            await ctx.conversation.enter("startDocumentDownload");
        } catch (error) {
            console.error("Error occurred:", error);
            ctx.reply("An error occurred while processing your request.");
        }
    } else {
        ctx.reply("Please send a video file.");
    }
}

function validateFolders(folders: FolderPath[]) {
    if (!folders || folders.length === 0) {
        throw new Error("No folders available for download.");
    }

    folders.forEach(folder => {
        if (!folder.path || !folder.title) {
            throw new Error("Folder path or title is missing.");
        }

        if (!existsSync(folder.path)) {
            mkdirSync(folder.path, { recursive: true });
        }
    });
}

const ACCESS_IDS = (process.env.ACCESS_IDS || "").split(",")

const bot = new Bot<MyContext>(process.env.BOT_TOKEN || "", {
    client: { apiRoot: process.env.BOT_API || "" }
});

const FOLDERS: FolderPath[] = [
    {
        title: "Movies",
        path:"/data/media/movies"
    },
    {
        title: "TV Shows",
        path: "/data/media/tv"
    }
];

validateFolders(FOLDERS);

// Use
bot.use(conversations());
bot.use(createConversation(startDocumentDownload));

// Commands
bot.command("start", start);

// On
bot.on(":document", onDocument);

// Start the bot
console.log("Starting bot.")
bot.start();
console.log("Bot alive.")
