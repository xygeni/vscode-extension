export class MarkdownParser {

  static marked_instance: any;

  static parse(text: string): string {
    if (!this.marked_instance) {
      // marked library doesn't support commonJS module types
      const getMarked = require('marked');
      this.marked_instance = getMarked;
    }
    return this.marked_instance.parse(text);
  }
}