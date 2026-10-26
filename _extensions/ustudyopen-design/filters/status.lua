-- Academic review is explicit metadata; rendering never marks content reviewed.
local labels = {lista = "Lista · revisión declarada", ["en-desarrollo"] = "En desarrollo · revisión pendiente", proximamente = "Próximamente"}
function Pandoc(doc)
  local status = pandoc.utils.stringify(doc.meta["ustudy-status"] or "")
  if status == "" then return doc end -- design gallery has no course status
  if not labels[status] then error("ustudy-status inválido: " .. status) end
  if status == "lista" and pandoc.utils.stringify(doc.meta["ustudy-reviewed"]) ~= "true" then
    error("Una página lista requiere ustudy-reviewed: true")
  end
  local badge = pandoc.Span({pandoc.Str(labels[status])}, pandoc.Attr("", {"uso-status", "uso-status--" .. status}))
  table.insert(doc.blocks, 1, pandoc.Div({pandoc.Para({badge})}, pandoc.Attr("", {"uso-page-status"})))
  return doc
end
