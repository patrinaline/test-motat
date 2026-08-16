const SUPABASE_URL = "https://jxsilhqrwbnytjghdwdw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xhJeQe0pPWiMq19Q5UgwgA_8b5mAJUg";
// -------------------------------------------------------

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getCardGuid() {
  const params = new URLSearchParams(window.location.search);
  return params.get('card'); // returns null if not present
}

let cardGuid = getCardGuid();

const devFallback = document.getElementById('dev-fallback');

if (!cardGuid) {
  console.log('No card GUID in URL. Showing manual entry fallback.');
  devFallback.style.display = 'block';
} else {
  console.log('Card GUID detected:', cardGuid);
  handleCardGuid(cardGuid);
}

document.getElementById('manual-guid-submit').addEventListener('click', () => {
  const manualGuid = document.getElementById('manual-guid-input').value.trim();
  if (manualGuid) {
    cardGuid = manualGuid;
    devFallback.style.display = 'none';
    handleCardGuid(cardGuid);
  }
});



async function handleCardGuid(guid) {
  console.log('Handling GUID:', guid);

  const { data: existingCard, error } = await db
    .from('nfc_cards')
    .select('id, user_id')
    .eq('guid', guid)
    .maybeSingle();

  if (error) {
    console.error('Error looking up card:', error);
    return;
  }

  if (existingCard) {
  console.log('Returning student. user_id:', existingCard.user_id);
  await showWelcomeBack(existingCard.user_id);
} else {
    console.log('New card — no user linked yet. Show onboarding.');
    document.getElementById('onboarding').classList.remove('hidden');
  }
}

document.getElementById('username-submit').addEventListener('click', async () => {
  const username = document.getElementById('username-input').value.trim();
  const statusEl = document.getElementById('onboarding-status');

  if (!username) {
    statusEl.textContent = 'Please enter a username.';
    return;
  }

  statusEl.textContent = 'Creating your account...';

  // Step 1: create the user
  const { data: newUser, error: userError } = await db
    .from('users')
    .insert({ username })
    .select()
    .single();

  if (userError) {
    console.error('Error creating user:', userError);
    if (userError.code === '23505') {
      statusEl.textContent = 'That username is taken. Try another.';
    } else {
      statusEl.textContent = 'Something went wrong. Try again.';
    }
    return;
  }

  console.log('User created:', newUser);

  // Step 2: link the card to that user
  const { error: cardError } = await db
    .from('nfc_cards')
    .insert({ guid: cardGuid, user_id: newUser.id });

  if (cardError) {
    console.error('Error linking card:', cardError);
    statusEl.textContent = 'Account created, but failed to link card.';
    return;
  }

  console.log('Card linked to user:', cardGuid, '→', newUser.id);
  statusEl.textContent = `Welcome, ${username}! Card linked.`;
});


// welcome back returning user //

async function showWelcomeBack(userId) {
  const { data: user, error: userError } = await db
    .from('users')
    .select('username')
    .eq('id', userId)
    .single();

  if (userError) {
    console.error('Error fetching user:', userError);
    return;
  }

  console.log('Fetched user:', user);

  document.getElementById('welcome-message').textContent =
    `Hi ${user.username}, good to see you again.`;
  document.getElementById('welcome-back').classList.remove('hidden');
}