const yearSlider = document.querySelector("#year-slider")
const yearOutput = document.querySelector("#year-output")

function updateYear() {
  yearOutput.textContent = yearSlider.value
}

yearSlider.addEventListener("input", updateYear)
yearSlider.addEventListener("change", updateYear)

document.querySelectorAll(".layer").forEach((button) => {
  button.addEventListener("click", () => {
    const isSelected = button.getAttribute("aria-pressed") === "true"

    document.querySelectorAll(".layer").forEach((layer) => {
      layer.setAttribute("aria-pressed", "false")
    })

    button.setAttribute("aria-pressed", String(!isSelected))
    document.querySelector("#layer-note").textContent = isSelected
      ? "Illustrative view only. Historical and live layer data is not connected yet."
      : `${button.textContent.trim()} selected. Illustrative view only; source data is not connected yet.`
  })
})
