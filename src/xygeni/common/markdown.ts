import { escapeHtml } from './html';

export class MarkdownParser {

  static markedInstance: any;

  static parse(text: string): string {
    if (!this.markedInstance) {
      // marked is ESM-only; the lazy require defers loading it until the first render.
      const { Marked } = require('marked');
      // Explanations come from the scanner: raw HTML inside them must show as text, never render.
      this.markedInstance = new Marked({
        renderer: {
          html({ text }: { text: string }) { return escapeHtml(text); }
        }
      });
    }
    return this.markedInstance.parse(text);
  }
}
