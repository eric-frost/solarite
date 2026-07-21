export function unwrapDoc(text) {
  let out = [];
  let inFence = false;
  let joinable = false;
  for (let line of text.split(`
`)) {
    let fenceEdge = /^\s*(```|~~~)/.test(line);
    if (inFence || fenceEdge) {
      out.push(line);
      joinable = false;
      if (fenceEdge)
        inFence = !inFence;
      continue;
    }
    let structural = /^\s/.test(line) || /^([-*+•>|]|#{1,6})\s|^@\w|^\d+[.)]\s/.test(line);
    if (joinable && line.trim() && !structural)
      out[out.length - 1] = out[out.length - 1].trimEnd() + " " + line.trim();
    else
      out.push(line);
    joinable = !!line.trim() && !structural && !/\s\s$/.test(line);
  }
  return out.join(`
`);
}
