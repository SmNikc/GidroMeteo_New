"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadImages = downloadImages;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const http = __importStar(require("http"));
const https = __importStar(require("https"));
async function downloadImages(config) {
    const outputDir = config.outputDir || 'images';
    await (0, promises_1.mkdir)(outputDir, { recursive: true });
    await Promise.all(config.urls.map((url) => {
        const lib = url.startsWith('https') ? https : http;
        return new Promise((resolve, reject) => {
            lib
                .get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
                    res.resume();
                    return;
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', async () => {
                    try {
                        const filePath = (0, path_1.join)(outputDir, (0, path_1.basename)(url));
                        await (0, promises_1.writeFile)(filePath, Buffer.concat(chunks));
                        resolve();
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            })
                .on('error', reject);
        });
    }));
}
