/* NVC word lists for Day Quest's check-in and Conflict button (Junyan, 2026-10-10).
   Feelings: the CNVC Feelings Inventory (cnvc.org, 2023), by family. Needs: the CNVC Needs
   Inventory plus the NVC Needs Inventory he keeps on his Caney page (emotional safety,
   reassurance, self-worth, fun, laughter, peace, mourning). Each feeling family carries what
   it does to prana and body at "clearly" (Junyan, d12: met +2 to +3; worry -3; anger -4 and
   body -2; overwhelmed -3; sad -2; tired body -2). Thought words ("I feel ignored") are
   judgements dressed as feelings; each points to the feelings and needs usually under it. */
(function (root) {
  const met = [
    ["Affectionate", "💗", 3, 0, "compassionate friendly loving open-hearted sympathetic tender warm"],
    ["Engaged", "🔎", 2, 0, "absorbed alert curious engrossed enchanted entranced fascinated interested intrigued involved spellbound stimulated"],
    ["Hopeful", "🌅", 2, 0, "expectant encouraged optimistic"],
    ["Confident", "🦁", 2, 0, "empowered open proud safe secure"],
    ["Excited", "⚡", 2, 1, "amazed animated ardent aroused astonished dazzled eager energetic enthusiastic giddy invigorated lively passionate surprised vibrant"],
    ["Grateful", "🙏", 3, 0, "appreciative moved thankful touched"],
    ["Inspired", "✨", 3, 0, "amazed awed wonder"],
    ["Joyful", "😊", 3, 0, "amused delighted glad happy jubilant pleased tickled"],
    ["Exhilarated", "🤩", 3, 1, "blissful ecstatic elated enthralled exuberant radiant rapturous thrilled"],
    ["Peaceful", "🕊️", 3, 0, "calm clear-headed comfortable centered content equanimous fulfilled mellow quiet relaxed relieved satisfied serene still tranquil trusting"],
    ["Refreshed", "🌿", 2, 2, "enlivened rejuvenated renewed rested restored revived"],
  ];
  const unmet = [
    ["Afraid", "😟", -3, 0, "apprehensive dread foreboding frightened mistrustful panicked petrified scared suspicious terrified wary worried"],
    ["Annoyed", "😤", -2, 0, "aggravated dismayed disgruntled displeased exasperated frustrated impatient irritated irked"],
    ["Angry", "😠", -4, -2, "enraged furious incensed indignant irate livid outraged resentful"],
    ["Aversion", "😖", -3, 0, "animosity appalled contempt disgusted dislike hate horrified hostile repulsed"],
    ["Confused", "😕", -1, 0, "ambivalent baffled bewildered dazed hesitant lost mystified perplexed puzzled torn"],
    ["Disconnected", "😶", -2, 0, "alienated aloof apathetic bored cold detached distant distracted indifferent numb removed uninterested withdrawn"],
    ["Disquiet", "😬", -2, 0, "agitated alarmed discombobulated disconcerted disturbed perturbed rattled restless shocked startled troubled turbulent turmoil uncomfortable uneasy unnerved unsettled upset"],
    ["Embarrassed", "😳", -2, 0, "ashamed chagrined flustered guilty mortified self-conscious"],
    ["Fatigue", "🥱", 0, -2, "beat burnt-out depleted exhausted lethargic listless sleepy tired weary worn-out"],
    ["Pain", "💔", -3, 0, "agony anguished bereaved devastated grief heartbroken hurt lonely miserable regretful remorseful"],
    ["Sad", "😢", -2, 0, "depressed dejected despair despondent disappointed discouraged disheartened forlorn gloomy heavy-hearted hopeless melancholy unhappy wretched"],
    ["Tense", "😣", -3, -1, "anxious cranky distressed distraught edgy fidgety frazzled irritable jittery nervous overwhelmed restless stressed-out"],
    ["Vulnerable", "🥺", -2, 0, "fragile guarded helpless insecure leery reserved sensitive shaky"],
    ["Yearning", "🌧️", -1, 0, "envious jealous longing nostalgic pining wistful"],
  ];
  const fam = (met, [name, icon, p, b, words]) => ({ name, icon, p, b, met, words: words.split(" ") });
  const needs = [
    ["Connection", "acceptance affection appreciation belonging cooperation communication closeness community companionship compassion consideration consistency empathy inclusion intimacy love mutuality nurturing respect self-respect safety emotional-safety security stability support reassurance to-know-and-be-known to-see-and-be-seen to-understand-and-be-understood trust warmth"],
    ["Physical wellbeing", "air food movement rest sleep sexual-expression safety shelter touch water"],
    ["Honesty", "authenticity integrity presence self-worth"],
    ["Play", "joy humor fun laughter"],
    ["Peace", "beauty communion ease equality harmony inspiration order peace"],
    ["Autonomy", "choice freedom independence space spontaneity"],
    ["Meaning", "awareness celebration challenge clarity competence consciousness contribution creativity discovery efficacy effectiveness growth hope learning mourning participation purpose self-expression stimulation to-matter understanding"],
  ].map(([name, words]) => ({ name, words: words.split(" ") }));
  // thought words: [the word, feelings usually under it, needs usually under it]
  const thoughts = [
    ["ignored", "hurt lonely", "inclusion to-matter"], ["rejected", "hurt scared", "acceptance belonging"],
    ["attacked", "scared angry", "emotional-safety respect"], ["blamed", "angry scared", "understanding fairness"],
    ["criticized", "hurt embarrassed", "understanding acceptance"], ["judged", "hurt vulnerable", "acceptance understanding"],
    ["misunderstood", "frustrated lonely", "to-understand-and-be-understood clarity"], ["unappreciated", "sad disappointed", "appreciation to-matter"],
    ["disrespected", "angry hurt", "respect consideration"], ["pressured", "anxious resentful", "choice space"],
    ["manipulated", "angry suspicious", "autonomy trust"], ["abandoned", "scared lonely", "support connection"],
    ["betrayed", "hurt angry", "trust honesty"], ["used", "angry resentful", "mutuality appreciation"],
    ["controlled", "frustrated resentful", "autonomy choice"], ["unheard", "frustrated lonely", "to-be-heard empathy"],
  ].map(([w, f, n]) => ({ w, feel: f.split(" "), need: n.split(" ") }));
  root.NVC_WORDS = { families: [...met.map((x) => fam(true, x)), ...unmet.map((x) => fam(false, x))], needs, thoughts };
})(typeof self !== "undefined" ? self : globalThis);
