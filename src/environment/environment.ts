import {config as dotenvConfig} from "dotenv";
import {uppercaseKeys} from "../api/util.js";

// 加载 .env 文件
dotenvConfig();

export const environment = uppercaseKeys(process.env as Record<string, unknown>);
