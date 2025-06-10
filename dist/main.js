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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const decoder_1 = require("./decoder");
const i18n = __importStar(require("i18n"));
i18n.configure({
    locales: ['ru'],
    directory: path.join(__dirname, 'i18n'),
    defaultLocale: 'ru',
    objectNotation: true,
});
i18n.setLocale('ru');
const inputPath = process.argv[2];
if (!inputPath) {
    console.error(i18n.__('error_no_input'));
    process.exit(1);
}
try {
    const input = fs.readFileSync(path.resolve(inputPath), 'utf8');
    const messages = (0, decoder_1.decodeMessage)(input);
    const output = (0, decoder_1.formatMessage)(messages);
    fs.writeFileSync('output.txt', output);
    fs.writeFileSync('currents.txt', '');
    console.log(i18n.__('success_output_written'));
}
catch (err) {
    console.error(i18n.__('error_read_file', { message: err.message }));
    process.exit(1);
}
