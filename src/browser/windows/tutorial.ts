console.log("Tutorial module loaded");

document.addEventListener("DOMContentLoaded", () => {
  const steps = document.querySelectorAll(".tutorial-step");
  const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
  const nextBtn = document.getElementById("nextBtn");
  const finishContainer = document.getElementById("finishContainer");
  const setModsPathBtn = document.getElementById(
    "setModsPathBtn",
  ) as HTMLButtonElement;
  const finishTutorialBtn = document.getElementById(
    "finishTutorialBtn",
  ) as HTMLButtonElement;
  const currentStepEl = document.getElementById("currentStep");
  const totalStepsEl = document.getElementById("totalSteps") as HTMLElement;

  let currentStepIndex = 0;

  function updateStep(newIndex) {
    // Explicitly hide all steps
    steps.forEach((step: HTMLElement, index) => {
      if (index === newIndex) {
        // Show current step
        step.style.display = "block";
        step.classList.add("active");
      } else {
        // Hide other steps
        step.style.display = "none";
        step.classList.remove("active");
      }
    });

    // Update step indicator
    currentStepEl.textContent = newIndex + 1;

    // Update navigation buttons
    prevBtn.disabled = newIndex === 0;

    // Show/hide finish button on last step
    if (newIndex === steps.length - 1) {
      nextBtn.style.display = "none";
      finishContainer.style.display = "block";
    } else {
      nextBtn.style.display = "block";
      finishContainer.style.display = "none";
    }
  }

  // Next button
  nextBtn.addEventListener("click", () => {
    if (currentStepIndex < steps.length - 1) {
      currentStepIndex++;
      updateStep(currentStepIndex);
    }
  });

  // Previous button
  prevBtn.addEventListener("click", () => {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      updateStep(currentStepIndex);
    }
  });

  // Set Mods Path button
  setModsPathBtn.addEventListener("click", async () => {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        await window.api.settings.setModsPath(newPath);

        // Update button state
        setModsPathBtn.textContent = "Mods Path Set!";
        setModsPathBtn.disabled = true;
        setModsPathBtn.classList.remove("btn-primary");
        setModsPathBtn.classList.add("btn-success");
      }
    } catch (error) {
      console.error("Error setting mods path:", error);
      alert("Failed to set mods path");
    }
  });

  // Finish Tutorial button
  finishTutorialBtn.addEventListener("click", async () => {
    try {
      // Disable button and show loading
      finishTutorialBtn.disabled = true;
      finishTutorialBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Loading...
            `;

      // Load initial configurations
      await window.api.tutorial.initializeConfigurations();

      // Finish tutorial and show main window
      await window.api.tutorial.finishTutorial();
    } catch (error) {
      console.error("Initialization error:", error);

      // Reset button state
      finishTutorialBtn.disabled = false;
      finishTutorialBtn.textContent = "Got It!";

      // Show error to user
      alert(`Initialization failed: ${error.message}`);
    }
  });

  // Theme selection handling
  const themeOptions = document.querySelectorAll(".theme-option");
  themeOptions.forEach((option: HTMLElement) => {
    option.addEventListener("click", async () => {
      // Remove active class from all options
      themeOptions.forEach((opt) => opt.classList.remove("active"));

      // Add active class to selected option
      option.classList.add("active");

      // Get the theme value
      const isDark = option.dataset.theme === "dark";

      try {
        // Save theme preference
        await window.api.settings.setDarkMode(isDark);

        // Apply theme immediately
        document.body.classList.toggle("dark-mode", isDark);
      } catch (error) {
        console.error("Error setting theme:", error);
      }
    });
  });

  // Load current theme setting
  window.api.settings.getDarkMode().then((isDark) => {
    const activeTheme = isDark ? "dark" : "light";
    themeOptions.forEach((option: HTMLElement) => {
      option.classList.toggle("active", option.dataset.theme === activeTheme);
    });
    document.body.classList.toggle("dark-mode", isDark);
  });

  // Set initial state
  updateStep(0);
  totalStepsEl.textContent = `${steps.length}`;
});

document.addEventListener("DOMContentLoaded", () => {
  // loadMedia();
});
