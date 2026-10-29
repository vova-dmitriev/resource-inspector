import type { ProjectSummary } from "../projects/types.js"

const ProjectHubText = {
  AddProject: "Подключить проект",
  AddTitle: "Новая карта",
  Cancel: "Отмена",
  ConfigPath: "Путь к profiles.json",
  Empty: "Пока нет подключённых проектов.",
  EnvironmentPath: "Путь к .env",
  MapPath: "Путь к HTML-карте",
  Name: "Название проекта",
  Open: "Открыть карту",
  Remove: "Отключить",
  Save: "Сохранить проект",
  Title: "Resource Inspector",
  UnableToSave: "Не удалось сохранить. Проверьте пути, карту и привязки ресурсов.",
} as const

export function renderProjectHubPage(projects: readonly ProjectSummary[]) {
  const rows = projects
    .map(
      ({ id, name }) => `
        <li class="project-row">
          <a class="project-open" href="/projects/${escapeHtml(id)}/">${escapeHtml(name)}</a>
          <div class="project-actions">
            <a href="/projects/${escapeHtml(id)}/">${ProjectHubText.Open}</a>
            <button class="project-edit" type="button" data-project-id="${escapeHtml(id)}">Редактировать</button>
            <button class="project-remove" type="button" data-project-id="${escapeHtml(id)}">${ProjectHubText.Remove}</button>
          </div>
        </li>`,
    )
    .join("")
  const projectData = JSON.stringify(projects).replaceAll("<", "\\u003c")

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${ProjectHubText.Title}</title>
<style>
:root{font:16px/1.5 system-ui,sans-serif;color-scheme:light dark;--surface:#fff;--text:#20242a;--muted:#69727d;--border:#c7cdd4;--accent:#286fb5}
@media(prefers-color-scheme:dark){:root{--surface:#17191d;--text:#eef0f3;--muted:#b0b6be;--border:#50555e;--accent:#83baff}}
*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--text)}main{width:min(100% - 2rem,64rem);margin:clamp(2rem,7vh,5rem) auto}header{margin-bottom:2rem}h1{margin:0;font-size:clamp(1.7rem,4vw,2.5rem);letter-spacing:-.035em}header p{margin:.35rem 0 0;color:var(--muted)}h2{margin:0 0 1rem;font-size:1.1rem}a,button{font:inherit}a{color:inherit;text-decoration-thickness:.08em;text-underline-offset:.18em}button{min-height:2.65rem;padding:.55rem .8rem;border:1px solid var(--border);border-radius:.55rem;background:transparent;color:inherit;cursor:pointer}button:hover,a:hover{color:var(--accent)}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.project-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem}.project-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}.project-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--border)}.project-open{font-size:1.1rem;font-weight:600}.project-actions{display:flex;align-items:center;justify-content:flex-end;gap:.7rem}.project-actions a{font-size:.9rem}.project-actions button{min-height:2.25rem;padding:.3rem .55rem;font-size:.9rem}.project-empty{padding:1rem 0;color:var(--muted)}.project-form-panel{margin-top:1.4rem;padding:1.1rem;border:1px solid var(--border);border-radius:.75rem}.project-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.project-field{display:grid;gap:.3rem}.project-field-wide{grid-column:1/-1}.project-field label{font-size:.9rem;font-weight:600}.project-field input{width:100%;min-height:2.65rem;padding:.55rem .7rem;border:1px solid var(--border);border-radius:.5rem;background:var(--surface);color:var(--text);font:inherit}.form-actions{display:flex;align-items:center;gap:.65rem;grid-column:1/-1}.form-error{grid-column:1/-1;margin:0;color:#b3261e}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:640px){main{width:min(100% - 1.25rem,64rem);margin:1.5rem auto}.project-heading,.project-row{align-items:flex-start;flex-direction:column}.project-actions{justify-content:flex-start;flex-wrap:wrap}.project-form{grid-template-columns:1fr}.project-field-wide{grid-column:auto}.form-actions,.form-error{grid-column:auto}}
</style>
</head>
<body>
<main>
<header><h1>${ProjectHubText.Title}</h1><p>Подключённые проекты и их карты архитектуры</p></header>
<section aria-labelledby="project-list-title">
<div class="project-heading"><h2 id="project-list-title">Проекты</h2><button id="add-project" type="button">${ProjectHubText.AddProject}</button></div>
${projects.length ? `<ul class="project-list">${rows}</ul>` : `<p class="project-empty">${ProjectHubText.Empty}</p>`}
</section>
<section class="project-form-panel" id="project-form-panel" aria-labelledby="project-form-title" hidden>
<h2 id="project-form-title">${ProjectHubText.AddTitle}</h2>
<form class="project-form" id="project-form">
<div class="project-field"><label for="project-name">${ProjectHubText.Name}</label><input id="project-name" name="name" required autocomplete="off"></div>
<div class="project-field"><label for="project-map-path">${ProjectHubText.MapPath}</label><input id="project-map-path" name="mapPath" required autocomplete="off" spellcheck="false"></div>
<div class="project-field project-field-wide"><label for="project-config-path">${ProjectHubText.ConfigPath}</label><input id="project-config-path" name="configPath" required autocomplete="off" spellcheck="false"></div>
<div class="project-field project-field-wide"><label for="project-env-path">${ProjectHubText.EnvironmentPath}</label><input id="project-env-path" name="envPath" required autocomplete="off" spellcheck="false"></div>
<p class="form-error" id="project-form-error" role="alert" hidden></p>
<div class="form-actions"><button type="submit">${ProjectHubText.Save}</button><button id="cancel-project" type="button">${ProjectHubText.Cancel}</button></div>
</form>
</section>
</main>
<script type="application/json" id="projects-data">${projectData}</script>
<script>
const projects = JSON.parse(document.getElementById("projects-data").textContent)
const panel = document.getElementById("project-form-panel")
const form = document.getElementById("project-form")
const errorMessage = document.getElementById("project-form-error")
const title = document.getElementById("project-form-title")
let editingProjectId

document.getElementById("add-project").addEventListener("click", () => openForm())
document.getElementById("cancel-project").addEventListener("click", () => closeForm())
form.addEventListener("submit", async (event) => {
  event.preventDefault()
  errorMessage.hidden = true
  const values = Object.fromEntries(new FormData(form).entries())
  const path = editingProjectId ? "/__resource-inspector/projects/" + encodeURIComponent(editingProjectId) : "/__resource-inspector/projects"
  const method = editingProjectId ? "PATCH" : "POST"

  try {
    const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(values) })
    if (!response.ok) throw new Error()
    window.location.reload()
  } catch {
    errorMessage.textContent = ${JSON.stringify(ProjectHubText.UnableToSave)}
    errorMessage.hidden = false
  }
})

document.querySelectorAll(".project-edit").forEach((button) => button.addEventListener("click", async () => {
  const projectId = button.dataset.projectId

  try {
    const response = await fetch("/__resource-inspector/projects/" + encodeURIComponent(projectId))
    if (!response.ok) throw new Error()
    const project = (await response.json()).project
    editingProjectId = projectId
    for (const key of ["name", "mapPath", "configPath", "envPath"]) form.elements.namedItem(key).value = project[key]
    title.textContent = "Редактировать проект"
    panel.hidden = false
    form.elements.namedItem("name").focus()
  } catch {
    errorMessage.textContent = ${JSON.stringify(ProjectHubText.UnableToSave)}
    errorMessage.hidden = false
    panel.hidden = false
  }
}))

document.querySelectorAll(".project-remove").forEach((button) => button.addEventListener("click", async () => {
  if (!window.confirm("Отключить проект? Его файлы и секреты останутся на месте.")) return

  const response = await fetch("/__resource-inspector/projects/" + encodeURIComponent(button.dataset.projectId), { method: "DELETE" })
  if (response.ok) window.location.reload()
}))

function openForm() {
  editingProjectId = undefined
  form.reset()
  title.textContent = ${JSON.stringify(ProjectHubText.AddTitle)}
  errorMessage.hidden = true
  panel.hidden = false
  form.elements.namedItem("name").focus()
}

function closeForm() {
  panel.hidden = true
  errorMessage.hidden = true
}
</script>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}
