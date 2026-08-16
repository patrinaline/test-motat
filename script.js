 const SUPABASE_URL = "https://jxsilhqrwbnytjghdwdw.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_xhJeQe0pPWiMq19Q5UgwgA_8b5mAJUg";
  // -------------------------------------------------------

  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Grab all the screen elements once, so we can show/hide them easily.
  const screenIntro = document.getElementById("screen-intro");
  const screenUsername = document.getElementById("screen-username");
  const screenWelcome = document.getElementById("screen-welcome");

  const inputUsername = document.getElementById("input-username");
  const statusUsername = document.getElementById("status-username");
  const welcomeHeading = document.getElementById("welcome-heading");
  const welcomeMessage = document.getElementById("welcome-message");
  const welcomeGuid = document.getElementById("welcome-guid");

  const screenExhibit = document.getElementById("screen-exhibit");
  const screenChallenge = document.getElementById("screen-challenge");

  const selectExhibit = document.getElementById("select-exhibit");
  const statusExhibit = document.getElementById("status-exhibit");

  const challengeExhibitName = document.getElementById("challenge-exhibit-name");
  const challengeQuestion = document.getElementById("challenge-question");
  const inputAnswer = document.getElementById("input-answer");
  const statusChallenge = document.getElementById("status-challenge");
  const challengeScore = document.getElementById("challenge-score");

  // Simple in-memory tally for this browser session -- just for the
  // demo, so you can see counts update live without writing a query.
  let correctCount = 0;
  let wrongCount = 0;

  function updateScoreDisplay() {
    challengeScore.textContent = `Correct: ${correctCount} · Wrong: ${wrongCount}`;
  }

  // Keeps track of which challenge is currently on screen, so the
  // submit button knows what to check the typed answer against.
  let currentChallenge = null;

  // If this page load came from tapping an NFC card, this holds the
  // GUID written on that card -- set in the DOMContentLoaded handler
  // below, and used instead of a random GUID when creating a player.
  let pendingGuid = null;

  function showScreen(screen) {
    screenIntro.classList.add("hidden");
    screenUsername.classList.add("hidden");
    screenWelcome.classList.add("hidden");
    screenExhibit.classList.add("hidden");
    screenChallenge.classList.add("hidden");
    screen.classList.remove("hidden");
  }

  // ---- Returning player check ----
  // Two ways someone can arrive already "known":
  // 1. They tapped an NFC card, which links here with ?player=GUID
  //    in the URL -- that GUID is the source of truth for this visit.
  // 2. No NFC tap this time (e.g. opened the site directly), but this
  //    browser remembers a guid from localStorage.
  //
  // This is wrapped in a named function and attached to BOTH
  // DOMContentLoaded and pageshow. Some mobile browsers reuse an
  // already-open tab instead of doing a full reload when a second NFC
  // tag is tapped -- in that case DOMContentLoaded never fires again,
  // but pageshow does, so this still re-checks the URL for a new guid.
  async function checkPlayerIdentity() {
    const urlParams = new URLSearchParams(window.location.search);
    const tappedGuid = urlParams.get("player");

    if (tappedGuid) {
      pendingGuid = tappedGuid;

      const { data, error } = await supabaseClient
        .from("players")
        .select("guid, username")
        .eq("guid", tappedGuid)
        .maybeSingle();

      if (error) {
        console.error(error);
      }

      if (data && data.username) {
        // This card is already linked to an account -- remember it
        // locally too, and go straight to welcome back.
        localStorage.setItem("player_guid", data.guid);
        localStorage.setItem("player_username", data.username);
        welcomeHeading.textContent = "Welcome back!";
        welcomeMessage.textContent = `Good to see you again, ${data.username}.`;
        welcomeGuid.textContent = `Your GUID: ${data.guid}`;
        showScreen(screenWelcome);
      } else {
        // Brand new card, not linked to anyone yet -- ask for a
        // username, but keep using THIS guid rather than a random one.
        showScreen(screenUsername);
      }
      return;
    }

    const existingGuid = localStorage.getItem("player_guid");
    const existingUsername = localStorage.getItem("player_username");

    if (existingGuid && existingUsername) {
      welcomeHeading.textContent = "Welcome back!";
      welcomeMessage.textContent = `Good to see you again, ${existingUsername}.`;
      welcomeGuid.textContent = `Your GUID: ${existingGuid}`;
      showScreen(screenWelcome);
    }
  }

  window.addEventListener("DOMContentLoaded", checkPlayerIdentity);
  window.addEventListener("pageshow", checkPlayerIdentity);

  // ---- Screen 1 -> Screen 2 ----
  document.getElementById("btn-start").addEventListener("click", () => {
    showScreen(screenUsername);
  });

  // ---- Screen 2: create the player in Supabase ----
  document.getElementById("btn-submit").addEventListener("click", async () => {
    const username = inputUsername.value.trim();

    if (!username) {
      statusUsername.textContent = "Type a username first.";
      return;
    }

    statusUsername.textContent = "Saving...";

    // Use the GUID from the tapped NFC card if this visit came from
    // one. Otherwise (e.g. testing straight in a browser with no
    // physical card involved) generate a fresh one, same as before.
    const guid = pendingGuid || crypto.randomUUID();

    // upsert instead of insert: if this guid already has a row (e.g.
    // the card was tapped once before but never got a username), it
    // updates that row. If it's a brand new guid, it creates one.
    const { data, error } = await supabaseClient
      .from("players")
      .upsert({ guid: guid, username: username }, { onConflict: "guid" })
      .select();

    if (error) {
      console.error(error);
      statusUsername.textContent = "Something went wrong: " + error.message;
      return;
    }

    // Save the guid + username locally so this device remembers them
    // next time, without needing a real login.
    localStorage.setItem("player_guid", guid);
    localStorage.setItem("player_username", username);

    welcomeHeading.textContent = "You're in!";
    welcomeMessage.textContent = `Nice to meet you, ${username}. Your progress will now save under this ID.`;
    welcomeGuid.textContent = `Your GUID: ${guid}`;
    showScreen(screenWelcome);
  });

  // ---- Screen 3 -> Screen 4: load exhibits into the dropdown ----
  document.getElementById("btn-find-exhibit").addEventListener("click", async () => {
    statusExhibit.textContent = "Loading exhibits...";
    showScreen(screenExhibit);

    const { data, error } = await supabaseClient
      .from("exhibits")
      .select("exhibit_id, name");

    if (error) {
      console.error(error);
      statusExhibit.textContent = "Couldn't load exhibits: " + error.message;
      return;
    }

    selectExhibit.innerHTML = "";
    data.forEach((exhibit) => {
      const option = document.createElement("option");
      option.value = exhibit.exhibit_id;
      option.textContent = exhibit.name;
      selectExhibit.appendChild(option);
    });

    statusExhibit.textContent = "";
  });

  // ---- Screen 4 -> Screen 5: "scan" the exhibit and load a challenge ----
  document.getElementById("btn-enter-exhibit").addEventListener("click", async () => {
    const exhibitId = selectExhibit.value;
    const exhibitName = selectExhibit.options[selectExhibit.selectedIndex].textContent;
    const playerGuid = localStorage.getItem("player_guid");

    statusExhibit.textContent = "Entering exhibit...";

    const { data: challenges, error: challengeError } = await supabaseClient
      .from("challenges")
      .select("challenge_id, question, answer")
      .eq("exhibit_id", exhibitId)
      .eq("type", "type_answer")
      .limit(1);

    if (challengeError) {
      console.error(challengeError);
      statusExhibit.textContent = "Couldn't load a challenge: " + challengeError.message;
      return;
    }

    if (!challenges || challenges.length === 0) {
      statusExhibit.textContent = "No type-your-answer challenge exists for this exhibit yet.";
      return;
    }

    currentChallenge = challenges[0];

    const { error: visitError } = await supabaseClient
      .from("exhibit_visits")
      .insert({ player_guid: playerGuid, exhibit_id: exhibitId });

    if (visitError) {
      console.error(visitError);
    }

    challengeExhibitName.textContent = exhibitName;
    challengeQuestion.textContent = currentChallenge.question;
    inputAnswer.value = "";
    statusChallenge.textContent = "";
    statusChallenge.className = "status";
    showScreen(screenChallenge);
  });

  // ---- Screen 5: check the typed answer ----
  document.getElementById("btn-submit-answer").addEventListener("click", async () => {
    const typedAnswer = inputAnswer.value.trim();

    if (!typedAnswer) {
      statusChallenge.textContent = "Type an answer first.";
      return;
    }

    const isCorrect = typedAnswer.toLowerCase() === currentChallenge.answer.toLowerCase();
    const playerGuid = localStorage.getItem("player_guid");

    // Log this attempt -- right or wrong -- so it can be counted later.
    const { error: attemptError } = await supabaseClient
      .from("challenge_attempts")
      .insert({
        player_guid: playerGuid,
        challenge_id: currentChallenge.challenge_id,
        submitted_answer: typedAnswer,
        is_correct: isCorrect
      });

    if (attemptError) {
      // Don't block the player over a logging failure -- just note it.
      console.error(attemptError);
    }

    if (isCorrect) {
      correctCount++;
      statusChallenge.textContent = "Correct!";
      statusChallenge.className = "status feedback-correct";
    } else {
      wrongCount++;
      statusChallenge.textContent = "Not quite -- try again.";
      statusChallenge.className = "status feedback-incorrect";
    }

    updateScoreDisplay();
  });

  // ---- Screen 5 -> Screen 3: back to menu ----
  document.getElementById("btn-back-to-menu").addEventListener("click", () => {
    showScreen(screenWelcome);
  });

  // ---- Demo-only reset button ----
  // Clears localStorage so you can test the "new player" flow again
  // without needing a different browser or incognito window.
  document.getElementById("btn-reset").addEventListener("click", () => {
    localStorage.removeItem("player_guid");
    localStorage.removeItem("player_username");
    inputUsername.value = "";
    statusUsername.textContent = "";
    showScreen(screenIntro);
  });
