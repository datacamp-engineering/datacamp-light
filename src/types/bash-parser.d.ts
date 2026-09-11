declare module 'bash-parser' {
  interface AstNode {
    type: string;
    [key: string]: any;
  }

  interface ParseOptions {
    mode?: 'posix' | 'bash';
    [key: string]: any;
  }

  function parse(script: string, options?: ParseOptions): AstNode;
  export default parse;
}
