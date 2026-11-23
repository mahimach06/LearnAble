
const lessons = {
  1: {
    title: "Lesson 1: Addition",
    explanation: "Addition means combining numbers together.",
    question: "What is 5 + 3?",
    answers: [7, 8, 9],
    correct: 8
  },
  2: {
    title: "Lesson 2: Subtraction",
    explanation: "Subtraction means taking a number away.",
    question: "What is 10 - 4?",
    answers: [5, 6, 7],
    correct: 6
  },
  3: {
    title: "Lesson 3: Multiplication",
    explanation: "Multiplication means repeated addition.",
    question: "What is 3 × 4?",
    answers: [10, 12, 14],
    correct: 12
  },
  4: {
    title: "Lesson 4: Division",
    explanation: "Division means splitting into equal groups.",
    question: "What is 12 ÷ 3?",
    answers: [3, 4, 6],
    correct: 4
  }
};

let currentLesson = 1;
let loggedIn = false;

// Show the selected page
function showPage(page) {
  if (page === "dashboard" && !loggedIn) {
    alert("Please log in first.");
    page = "login";
  }

  const pages = ["home", "register", "login", "dashboard"];

  pages.forEach(id => {
    document.getElementById(id).hidden = id !== page;
  });

  if (page === "dashboard") {
    loadProgress();
  }
}

// Display a selected lesson
function startLesson(number) {
  currentLesson = number;

  const lesson = lessons[number];

  document.getElementById("lesson").hidden = false;
  document.getElementById("lessonTitle").textContent =
    lesson.title;

  document.getElementById("lessonExplanation").textContent =
    lesson.explanation;

  document.getElementById("lessonQuestion").textContent =
    lesson.question;

  document.getElementById("feedback").textContent = "";

  const answerButtons = document.getElementById("answerButtons");
  answerButtons.innerHTML = "";

  lesson.answers.forEach(answer => {
    const button = document.createElement("button");
    button.textContent = answer;

    button.addEventListener("click", () => {
      checkAnswer(answer);
    });

    answerButtons.appendChild(button);
  });
}

// Check the selected answer
async function checkAnswer(answer) {
  const feedback = document.getElementById("feedback");

  if (answer !== lessons[currentLesson].correct) {
    feedback.textContent = "Not quite! Try again.";
    return;
  }

  try {
    const result = await sendRequest("/api/progress", {
      lesson: currentLesson
    });

    feedback.textContent = "Correct! Progress saved!";

    document.getElementById("progress").textContent =
      "Lessons completed: " + result.progress;

  } catch (error) {
    feedback.textContent = error.message;
  }
}

// Send POST requests to the server
async function sendRequest(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Something went wrong.");
  }

  return result;
}

// Load saved progress
async function loadProgress() {
  try {
    const response = await fetch("/api/me");

    if (!response.ok) {
      throw new Error("Please log in.");
    }

    const user = await response.json();

    loggedIn = true;

    document.getElementById("progress").textContent =
      "Lessons completed: " + user.progress;

  } catch (error) {
    document.getElementById("progress").textContent =
      "Unable to load progress.";
  }
}

// Register an account
document.getElementById("registerForm")
  .addEventListener("submit", async function(event) {
    event.preventDefault();

    try {
      const result = await sendRequest("/api/register", {
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        password: document.getElementById("password").value
      });

      alert(result.message);
      showPage("login");

    } catch (error) {
      alert(error.message);
    }
  });

// Log in
document.getElementById("loginForm")
  .addEventListener("submit", async function(event) {
    event.preventDefault();

    try {
      const result = await sendRequest("/api/login", {
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value
      });

      loggedIn = true;

      document.getElementById("logoutButton").hidden = false;

      alert("Welcome, " + result.name + "!");

      showPage("dashboard");

    } catch (error) {
      alert(error.message);
    }
  });

// Log out
async function logout() {
  try {
    await sendRequest("/api/logout", {});
    loggedIn = false;

    document.getElementById("logoutButton").hidden = true;
    document.getElementById("lesson").hidden = true;

    showPage("home");

  } catch (error) {
    alert(error.message);
  }
}

// Larger text accessibility option
document.getElementById("largeText")
  .addEventListener("change", function() {
    document.body.style.fontSize =
      this.checked ? "20px" : "16px";
  });

// Step-by-step explanation preference
document.getElementById("simpleSteps")
  .addEventListener("change", function() {
    const lesson = document.getElementById("lesson");

    lesson.style.lineHeight =
      this.checked ? "2" : "normal";
  });

// Restore login after refreshing
async function restoreSession() {
  try {
    const response = await fetch("/api/me");

    if (response.ok) {
      loggedIn = true;
      document.getElementById("logoutButton").hidden = false;
    }
  } catch (error) {
    console.error("Session check failed:", error);
  }
}

showPage("home");
restoreSession();
