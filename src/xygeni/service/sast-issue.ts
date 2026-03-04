
import { XygeniIssueData } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';
import { IssueCodeFlow, getCodeFlowDataModel } from './code-flow';

export interface SastXygeniIssueData extends XygeniIssueData {
  branch: string;
  language: string;
  cwe: number;
  cwes: string[];
  container: string;
  codeFlows: IssueCodeFlow[];
  vulnerabilityRaw?: any;
}


export class SastXygeniIssue extends AbstractXygeniIssue {

  branch: string;
  language: string;
  cwe: number;
  cwes: string[];
  container: string;
  codeFlows: IssueCodeFlow[];
  vulnerabilityRaw?: any;

  constructor(issue: SastXygeniIssueData) {
    super(issue);
    this.branch = issue.branch;
    this.language = issue.language;
    this.cwe = issue.cwe;
    this.cwes = issue.cwes;
    this.container = issue.container;
    this.codeFlows = issue.codeFlows;
    this.vulnerabilityRaw = issue.vulnerabilityRaw;
  }

  override getSubtitleLineHtml(): string {

    let subtitle = this.categoryName;

    if (this.url) {
      subtitle += ` &nbsp;&nbsp; <a href="${this.url}" target="_blank">${this.type}</a>`;
    }
    else {
      subtitle += ` ${this.type}`;
    }

    if (this.cwes.length > 0) {

      subtitle += ' &nbsp;&nbsp;  ' + this.cwes.map(
        weakness => {
          const wcode = weakness.split('-')[1]; // use the CWE code (CWE-123)
          return `<a href="https://cwe.mitre.org/data/definitions/${wcode}.html" target="_blank">${weakness}</a>`;
        }).join(' &nbsp;&nbsp; ');
    }

    return subtitle;
  }

  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
          ${this.field(this.explanation, 'Explanation')}         
          ${this.field(this.type, 'Type')}
          ${this.field(this.where(this.branch, undefined, undefined), 'Where')}
          ${this.field(this.url, 'Fount At')}                  
          ${this.field(this.file, 'Location')}
          ${this.field(this.detector, 'Found By')}
          
          ${this.fieldTags(this.tags)}

                                 
      </table>
                
        <p><span id="xy-detector-doc">Loading...</span></p>
      </div>`;
  }
  getCodeSnippetHtmlTab(): string {
    return `
    <input type="radio" name="tabs" id="tab-2">
    <label for="tab-2">CODE SNIPPET</label>`;
  }
  getCodeFlowHtmlTab(): string {
    return `
    <input type="radio" name="tabs" id="tab-4">
    <label for="tab-4">CODE FLOW</label>`;

  }

  getCodeFlowHtml(): string {
    if (!this.codeFlows || this.codeFlows.length === 0) {
      return `<div id="tab-content-4"><p>No code flow data available.</p></div>`;
    }

    const { nodes, links, paths } = getCodeFlowDataModel(this.codeFlows);
    const script = CODE_FLOW_DIAGRAM_SCRIPT
      .replace('DATA_PLACE_HOLDER_NODES', nodes)
      .replace('DATA_PLACE_HOLDER_LINKS', links)
      .replace('DATA_PLACE_HOLDER_PATHS', paths);

    return `
    <div id="tab-content-4">  
      <div class="xy-code-flow-container">
        <div class="xy-view-toggle">                
            <button id="btn-graph" class="xy-toggle-btn active" >Graph view</button>
            <button id="btn-text" class="xy-toggle-btn">Path</button>
        </div>
        <div id="code-flow-container" class="code-flow-wrapper">
        </div>
      </div>

      <script type="application/json" id="vuln-json">${JSON.stringify(this.vulnerabilityRaw)}</script>
      <script src="https://d3js.org/d3.v7.min.js" nonce="{{nonce}}"></script>
      <script nonce="{{nonce}}">
        ${DIAGRAM_FUNCTION_SCRIPT}
        ${script}        
      </script>
    </div>
    `;

  }
}

const CODE_FLOW_DIAGRAM_SCRIPT = `
(function() {
    const nodes = DATA_PLACE_HOLDER_NODES;
    const links = DATA_PLACE_HOLDER_LINKS;
    const paths = DATA_PLACE_HOLDER_PATHS;
    let currentView = 'graph';

    function switchView(view) {

        console.log('switchView: ' + view);

        currentView = view;
        const btnGraph = document.getElementById('btn-graph');        
        const btnText = document.getElementById('btn-text');
        if (btnGraph) btnGraph.classList.toggle('active', view === 'graph');
        if (btnText) btnText.classList.toggle('active', view === 'text');
        
        const container = document.getElementById('code-flow-container');
        if (container) {
            if (view === 'graph') {
                container.style.height = 'auto';
                container.style.minHeight = '0';
            } else {
                container.style.minHeight = '0';
                container.style.height = 'auto';
            }
        }
        
        render();
    }

    function render() {
        const containerId = "#code-flow-container";
        if (currentView === 'graph') {
            renderDiagramInTab(containerId, nodes, links, paths);
        } else {
            renderTextFlowInTab(containerId, nodes);
        }
    }

    // Initialize  code flow buttons (graph view and path)
    function initUI() {
        // graph
        const btnGraph = document.getElementById('btn-graph');
        if (btnGraph) btnGraph.addEventListener('click', () => switchView('graph'));
        // path9
        const btnText = document.getElementById('btn-text');
        if (btnText) btnText.addEventListener('click', () => switchView('text'));
                
        // Initial render
        switchView('graph');
    }

    initUI();
})();
`;


const DIAGRAM_FUNCTION_SCRIPT = `
  function renderDiagramInTab(containerId, nodes, links, paths) {
        const container = d3.select(containerId);
        container.selectAll("*").remove();

        function getStackIconId(d, finalNodeKeys) {
            const key = d.id + "__" + d.level;
            const type = (d.type || "").toLowerCase();
            if (finalNodeKeys.has(key)) return '#stack-bottom';
            if (d.level === 0) return '#stack-top';
            if (type.includes('sanitizer') || type.includes('propagation')|| type.includes('sink')) return '#stack-middle';
            return '#stack-default';
        }

        const svg = container.append("svg")
            .attr("width","100%")
            .attr("height","100%")
            .style("display", "block")
            .style("background","transparent")
            .style("cursor", "grab");
            
        svg.on("active", () => svg.style("cursor", "grabbing"));

        const g = svg.append("g");
        const defs = svg.append("defs");
        const createStackSymbol = (id, rects) => {
            const symbol = defs.append("symbol")
                .attr("id", id)
                .attr("viewBox", "0 0 20 20");
            rects.forEach(r => {
                symbol.append("rect")
                    .attr("x", r.x).attr("y", r.y)
                    .attr("width", r.w).attr("height", r.h)
                    .attr("rx", 1.5)
                    .attr("fill", "#ffffff")
                    .attr("opacity", r.o)
                    .attr("stroke", "#e2e8f0")
                    .attr("stroke-width", r.sw);
            });
        };

        createStackSymbol("stack-top", [
            {x: 1, y: 3, w: 18, h: 4, o: 1.0, sw: 0.4},
            {x: 2, y: 8, w: 16, h: 4, o: 0.70, sw: 0.6},
            {x: 3, y: 13, w: 14, h: 4, o: 0.40, sw: 0.8}
        ]);
        createStackSymbol("stack-middle", [
            {x: 4, y: 3, w: 14, h: 4, o: 0.45, sw: 0.4},
            {x: 2, y: 8, w: 18, h: 4, o: 1.0, sw: 0.8},
            {x: 4, y: 13, w: 14, h: 4, o: 0.45, sw: 0.4}
        ]);
        createStackSymbol("stack-bottom", [
            {x: 3, y: 3, w: 14, h: 4, o: 0.40, sw: 0.8},
            {x: 2, y: 8, w: 16, h: 4, o: 0.70, sw: 0.6},
            {x: 1, y: 13, w: 18, h: 4, o: 1.0, sw: 0.4}
        ]);
        createStackSymbol("stack-default", [
            {x: 2, y: 3, w: 16, h: 4, o: 0.85, sw: 0.5},
            {x: 2, y: 9, w: 16, h: 4, o: 0.85, sw: 0.5},
            {x: 2, y: 15, w: 16, h: 4, o: 0.85, sw: 0.5}
        ]);
        
        const nodeRadius = 30;
        const colSpacing = 220;
        const rowSpacing = 180;

        const internalNodeMap = new Map();
        nodes.forEach(d => internalNodeMap.set(d.id + "__" + d.level, { ...d, paths: [] }));

        paths.forEach((path, pIdx) => {
            path.forEach((id, level) => {
                const key = id + "__" + level;
                const node = internalNodeMap.get(key);
                if (!node) return;
                node.paths.push({ pathIndex: pIdx });
            });
        });

        const allNodes = Array.from(internalNodeMap.values());
        allNodes.forEach(node => {
            const avgColumn = node.paths.reduce((sum,p)=>sum+p.pathIndex,0)/node.paths.length;
            node.x = avgColumn * colSpacing + 150;
            node.y = node.level * rowSpacing + 120;
        });

        const maxLevel = d3.max(allNodes, d => d.level) || 0;
        const totalHeight = (maxLevel + 1) * rowSpacing + 150;
        svg.attr("height", totalHeight);

        g.selectAll("path.link")
          .data(links)
          .enter()
          .append("path")
          .attr("fill","none")
          .attr("stroke","var(--vscode-panel-border)")
          .attr("stroke-width",2)
          .attr("d", d=>{
              const source = internalNodeMap.get(d.source);
              const target = internalNodeMap.get(d.target);
              if(!source || !target) return "";
              const controlX = source.x + Math.max(30,(target.x-source.x)/2);
              const controlY = (source.y + target.y)/2;
              return "M" + source.x + "," + source.y + " Q" + controlX + "," + controlY + " " + target.x + "," + target.y;
          });

        g.selectAll("path.link-arrow")
          .data(links)
          .enter()
          .append("path")
          .attr("fill", "var(--vscode-panel-border)")
          .attr("stroke", "var(--vscode-panel-border)")
          .attr("stroke-width", 2)
          .attr("d", d => {
              const source = internalNodeMap.get(d.source);
              const target = internalNodeMap.get(d.target);
              if(!source || !target) return "";
              const controlX = source.x + Math.max(30,(target.x-source.x)/2);
              const controlY = (source.y + target.y)/2;
              const mx = 0.25 * source.x + 0.5 * controlX + 0.25 * target.x;
              const my = 0.25 * source.y + 0.5 * controlY + 0.25 * target.y;
              return "M" + (mx-7) + "," + (my-5) + " L" + mx + "," + my + " L" + (mx-7) + "," + (my+5) + " Z";
          })
          .attr("transform", d => {
              const source = internalNodeMap.get(d.source);
              const target = internalNodeMap.get(d.target);
              if(!source || !target) return "";
              const controlX = source.x + Math.max(30,(target.x-source.x)/2);
              const controlY = (source.y + target.y)/2;
              const mx = 0.25 * source.x + 0.5 * controlX + 0.25 * target.x;
              const my = 0.25 * source.y + 0.5 * controlY + 0.25 * target.y;
              const angle = Math.atan2(target.y - source.y, target.x - source.x) * 180 / Math.PI;
              return "rotate(" + angle + ", " + mx + ", " + my + ")";
          });

        const finalNodeKeys = new Set();
        paths.forEach(path => {
            const lastLevel = path.length - 1;
            const lastKey = path[lastLevel] + "__" + lastLevel;
            finalNodeKeys.add(lastKey);
        });

        const nodeGroups = g.selectAll(".node")
          .data(allNodes)
          .enter()
          .append("g")
          .attr("class", "node")
          .attr("transform", d => "translate(" + d.x + ", " + d.y + ")")
          .style("cursor", "pointer")
          .on("click", (event, d) => {
             if (typeof vscode !== 'undefined') {
                vscode.postMessage({
                  command: 'jumpToFrame',
                  file: d.filePath,
                  beginLine: d.beginLine,
                  beginColumn: d.beginColumn,
                  endLine: d.endLine,
                  endColumn: d.endColumn
                });
             }
          });

        nodeGroups.append("circle")
          .attr("r", nodeRadius)
          .attr("fill", d => {
              const key = d.id + "__" + d.level;
              const type = (d.type || "").toLowerCase();
              if (d.level === 0) return "#59C9A6";
              if (finalNodeKeys.has(key)) return "#1f2937";
              if (type.includes("sanitizer")) return "#f59e0b";
              if (type.includes("propagation")) return "#3b82f6";
              return "#10b981";
          })
          .attr("stroke", d => {
              const key = d.id + "__" + d.level;
              const type = (d.type || "").toLowerCase();
              if (d.level === 0) return "#4d8a7c";
              if (finalNodeKeys.has(key)) return "#111827";
              if (type.includes("propagation")) return "#4d8a7c";
              if (type.includes("sanitizer")) return "#d97706";
              return "#059669";
          })
          .attr("stroke-width", 2);

        nodeGroups.append("use")
          .attr("href", d => getStackIconId(d, finalNodeKeys))
          .attr("x", -15)
          .attr("y", -15)
          .attr("width", 30)
          .attr("height", 30)
          .style("pointer-events", "none");

        g.selectAll("text.label")
          .data(allNodes.sort((a,b) => a.level !== b.level ? a.level - b.level : a.x - b.x))
          .enter()
          .append("text")
          .attr("class", "label")
          .attr("x", d => d.x)
          .attr("y", (d, i) => d.y + (i % 2 === 0 ? 45 : 65))
          .attr("text-anchor", "middle")  
          .text(d => d.label );        
          //.text(d => d.label || d.id);

        const badges = g.selectAll(".badge")
          .data(allNodes.filter(d => d.paths.length > 1))
          .enter()
          .append("g")
          .attr("class", "badge")
          .attr("transform", d => "translate(" + (d.x + 15) + ", " + (d.y - 15) + ")");

        badges.append("circle")
          .attr("r", 10)
          .attr("fill", "#9e9e9e")
          .attr("stroke", "white")
          .attr("stroke-width", 1);

        badges.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.3em")
          .style("font-size", "10px")
          .style("font-weight", "bold")
          .style("fill", "white")
          .text(d => d.paths.length);

        const zoom = d3.zoom()
          .scaleExtent([0.2, 4])
          .on("zoom", event => g.attr("transform", event.transform));
        svg.call(zoom);

        const controls = container.append("div").attr("class","xy-zoom-controls");
        controls.append("button").text("+")
            .attr("class", "xy-zoom-btn")
            .on("click", ()=> svg.transition().duration(300).call(zoom.scaleBy,1.2));
        controls.append("button").text("-")
            .attr("class", "xy-zoom-btn")
            .on("click", ()=> svg.transition().duration(300).call(zoom.scaleBy,0.8));
            
        const tooltip = container.append("div").attr("class", "tooltip");

          nodeGroups
          .on("mouseover", (event, d) => {
            tooltip
              .style("opacity", 1)
              .html(
                (d.filePath ? "<strong>" + d.filePath + "</strong><br>" : "") +
                "Line: " + d.line + "<br>" +
                (d.type ? "Type: " + d.type + "<br>" : "") +
                (d.category ? "Category: " + d.category + "<br>" : "") +
                (d.container ? "Container: " + d.container + "<br>" : "") +
                (d.injectionPoint ? "InjectionPoint: " + d.injectionPoint + "<br>" : "") +
                (d.code ? "<pre><code>" + d.code + "</code></pre>" : "")
              );
          })
          .on("mousemove", (event) => {
            const [mx, my] = d3.pointer(event, container.node());
            tooltip
              .style("left", (mx + 15) + "px")
              .style("top", (my + 15) + "px");
          })
          .on("mouseout", () => {
            tooltip.style("opacity", 0);
          });
    }

    function renderTextFlowInTab(containerId, nodes) {
        const container = d3.select(containerId);
        container.selectAll("*").remove();

        const steps = container.append("div")
            .attr("class", "xy-text-flow-container")
            .selectAll(".xy-flow-step")
            .data(nodes.sort((a, b) => a.level - b.level))
            .enter()
            .append("div")
            .attr("class", "xy-flow-step");

        steps.each(function(d) {
            const step = d3.select(this);
            const fileName = d.filePath ? d.filePath.split('/').pop() : 'Unknown';
            
            const header = step.append("div").attr("class", "xy-flow-step-header");
            header.append("span").attr("class", "xy-flow-step-file").text(fileName + ":" + d.line);
            header.append("span").attr("class", "xy-flow-step-type").text(d.type);

            step.append("div").attr("class", "xy-flow-step-path").text(d.filePath);

            const details = step.append("div").attr("class", "xy-flow-step-details");
            if (d.category) details.append("span").text("Category: ").append("b").text(d.category);
            if (d.container) details.append("span").text("Container: ").append("b").text(d.container);
            if (d.injectionPoint) details.append("span").text("InjectionPoint: ").append("b").text(d.injectionPoint);

            if (d.code) {
                step.append("pre").append("code").text(d.code);
            }
        });
    }`;