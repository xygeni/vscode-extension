
import * as vscode from 'vscode';
import { EventEmitter } from './interfaces';

export type Listener = () => void;

// allow service to isolate from vscode
export default class EventEmitterImpl implements EventEmitter {
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  public emitChange() {
    this._onDidChange.fire();
  }

}