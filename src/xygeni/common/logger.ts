import * as vscode from 'vscode';
import { ILogger, IOutputChannel } from './interfaces';
import { XYGENI_EXTENSION_OUTPUT_NAME } from './constants';



class LoggerImpl implements ILogger {

    private output: vscode.OutputChannel;

    constructor() {
        this.output = vscode.window.createOutputChannel(XYGENI_EXTENSION_OUTPUT_NAME);
    }


    public log(message: string) {
        this.output.appendLine(message);
    }

    public error(error: Error | unknown, message: string) {
        let emsg = message ? message + ': ' : ' ';
        if (error instanceof Error) {
            emsg += error ? error.message : ' Unknown error ';
        }
        console.error(error);
        this.output.appendLine(emsg);
    }

    showOutput() {
        this.output.show();
    }

    private stringifyError(error: Error | unknown): string {
        return JSON.stringify(error, Object.getOwnPropertyNames(error));
    }
}

export class OutputChannelWrapper implements IOutputChannel {
    constructor(private readonly outputChannel: vscode.OutputChannel) { }

    appendLine(value: string): void {
        this.outputChannel.appendLine(value);
    }

    append(value: string): void {
        this.outputChannel.append(value);
    }

    show(): void {
        this.outputChannel.show();
    }

    clear(): void {
        this.outputChannel.clear();
    }
}

export const Logger = new LoggerImpl();

export function createOutputChannelWrapper(outputChannel: vscode.OutputChannel): IOutputChannel {
    return new OutputChannelWrapper(outputChannel);
}
