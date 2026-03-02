

export interface IssueCodeFlow {
    // properties
    tags: string[];
    frames: IssueFrame[];
}


export interface IssueFrame {
    kind: string,
    // location
    filePath: string,
    beginLine: number,
    endLine: number,
    code: string,
    beginColumn: number,
    endColumn: number,
    container: string,
    injectPoint: string,
    category: string,
    // properties
}


/**
 * Convert the condeFlow list into a the nodes, paths and links 
 * @param codeFlows list of code flows to represent in the flow diagram
 * @returns nodes, links and paths to send to the flow diagram 
 */
export function getCodeFlowDataModel(codeFlows: IssueCodeFlow[]) {
    const nodes: any[] = [];
    const links: any[] = [];
    const paths: any[][] = [];
    const nodeMap = new Map();

    codeFlows.forEach((flow, pIdx) => {
      const currentPath: string[] = [];
      let prevId: string | null = null;

      flow.frames.forEach((frame, level) => {
        const baseId = frame.filePath + ":" + frame.beginLine;
        const key = baseId + "__" + level;

        if (!nodeMap.has(key)) {
          const nodeData = {
            id: baseId,
            level: level,
            label: frame.filePath.split('/').pop() + " (" + frame.beginLine + ")",
            filePath: frame.filePath,
            line: frame.beginLine,
            code: frame.code,
            type: frame.kind,
            category: frame.category,
            container: frame.container,
            injectionPoint: frame.injectPoint,
            beginLine: frame.beginLine,
            beginColumn: frame.beginColumn,
            endLine: frame.endLine,
            endColumn: frame.endColumn,            
          };
          nodeMap.set(key, nodeData);
          nodes.push(nodeData);
        }

        currentPath.push(baseId);

        if (prevId !== null) {
          links.push({
            source: prevId + "__" + (level - 1),
            target: key
          });
        }
        prevId = baseId;
      });
      paths.push(currentPath);
    });

    return {
      nodes: JSON.stringify(nodes),
      links: JSON.stringify(links),
      paths: JSON.stringify(paths)
    };
  }