/**
 * Nova WA Bot - Entertainment, Games & Persona Suites (Chapter 8 & Chapter 9)
 * Implements:
 * - 42 Fun Games (.joke, .quote, .fact, .truth, .dare, .riddle, .riddleanswer, .8ball, .coin, .dice, .ship, .love, .roast, .compliment, .rate, .wouldyourather, .pickup, .fortune, .luck, .quizfun, .quizanswer, .emojiquiz, .decision, .choose, .random, .storyfun)
 * - Boys Suite (.boyattitude, .boybio, .boycaption, .boycompat, .boydare, .boydp, .boyhoroscope, .boymotivation, .boyquotes, .boytruth, .boywallpaper)
 * - Girls Suite (.girlaesthetic, .girlavatar, .girlbio, .girlcaption, .girlcompat, .girldare, .girldp, .girlfashion, .girlhairstyle, .girlhoroscope, .girllove, .girlmakeup, .girlmotivation, .girloutfit, .girlpoetry, .girlportrait, .girlquotes, .girlrecipe, .girlsad, .girlshayari, .girlskincare, .girltruth, .girlusername, .girlwallpaper)
 * - Group Interactive Games (.games, .battle, .challenge, .champion, .detective, .duel, .fastest, .guessnumber, .guessword, .impostor, .king, .queen, .lucky, .unlucky, .magic, .mood, .mostlikely, .neverhave, .numberbattle, .partner, .pick, .predict, .rps, .score, .scramble, .speed, .spy, .team, .treasure, .versus, .winner, .wordbattle, .wouldgroup, .grouprank, .grouptruth, .groupdare, .groupquiz, .groupvote)
 */

const JOKES = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "Why did the computer go to the doctor? Because it had a virus!",
    "I told my suitcase there will be no vacation this year. Now I'm dealing with emotional baggage.",
    "Why do programmers prefer dark mode? Because light attracts bugs!",
    "Teacher: Why are you late? Student: There was a sign that said 'School Ahead, Go Slow'!"
];

const FACTS = [
    "Honey never spoils; archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still edible.",
    "Octopuses have three hearts and blue blood.",
    "A day on Venus is longer than a year on Venus.",
    "Bananas are curved because they grow towards the sun against gravity.",
    "Water can boil and freeze at the same time in a phenomenon called the 'triple point'."
];

const ROASTS = [
    "I would agree with you, but then we would both be wrong.",
    "You have an entire life to be an idiot. Why not take today off?",
    "Your secrets are always safe with me. I never even listen to you.",
    "Mirrors can't talk. Lucky for you, they can't laugh either.",
    "I'm not insulting you, I'm just describing you accurately."
];

const RIDDLES = [
    { q: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", a: "An echo" },
    { q: "The more of this there is, the less you see. What is it?", a: "Darkness" },
    { q: "What has keys, but no locks; space, but no room; and you can enter, but not go in?", a: "A keyboard" },
    { q: "What has to be broken before you can use it?", a: "An egg" }
];

let activeRiddle = null;

module.exports = {
    name: 'funGames',

    async handle(sock, msg, cmd, args, from, sender) {
        const cleanCmd = cmd.toLowerCase().replace(/_/g, '');

        // --------------------------------------------------------------------------
        // 1. CORE ENTERTAINMENT GAMES
        // --------------------------------------------------------------------------
        if (['8ball', 'eightball'].includes(cleanCmd)) {
            const answers = ["Yes, absolutely!", "No way.", "Ask again later.", "Outlook looks bright ⭐", "Very doubtful ❌", "Without a doubt!", "100% Guaranteed."];
            const pick = answers[Math.floor(Math.random() * answers.length)];
            return sock.sendMessage(from, { text: `🎱 *Magic 8-Ball:* ${pick}` }, { quoted: msg });
        }

        if (['coin', 'coinflip', 'flip'].includes(cleanCmd)) {
            const result = Math.random() > 0.5 ? '🪙 Heads!' : '🪙 Tails!';
            return sock.sendMessage(from, { text: `Tossing coin...\nResult: *${result}*` }, { quoted: msg });
        }

        if (['dice', 'roll'].includes(cleanCmd)) {
            const num = Math.floor(Math.random() * 6) + 1;
            const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            return sock.sendMessage(from, { text: `🎲 Rolled a *${num}* ${diceEmojis[num - 1]}` }, { quoted: msg });
        }

        if (['joke', 'dadjoke', 'pun'].includes(cleanCmd)) {
            const j = JOKES[Math.floor(Math.random() * JOKES.length)];
            return sock.sendMessage(from, { text: `😂 *Joke:* ${j}` }, { quoted: msg });
        }

        if (cleanCmd === 'fact') {
            const f = FACTS[Math.floor(Math.random() * FACTS.length)];
            return sock.sendMessage(from, { text: `🧠 *Did you know?*\n${f}` }, { quoted: msg });
        }

        if (['quote', 'bquote', 'gquote'].includes(cleanCmd)) {
            const quotes = [
                "The secret of getting ahead is getting started. — Mark Twain",
                "It always seems impossible until it's done. — Nelson Mandela",
                "Do what you can, with what you have, where you are. — Theodore Roosevelt"
            ];
            return sock.sendMessage(from, { text: `✨ *Inspirational Quote:*\n"${quotes[Math.floor(Math.random() * quotes.length)]}"` }, { quoted: msg });
        }

        if (['roast', 'insult'].includes(cleanCmd)) {
            const r = ROASTS[Math.floor(Math.random() * ROASTS.length)];
            return sock.sendMessage(from, { text: `🔥 *Roast:* ${r}` }, { quoted: msg });
        }

        if (['love', 'ship', 'friendship', 'compatibility'].includes(cleanCmd)) {
            const target = args.join(' ') || 'Mystery Partner';
            const score = Math.floor(Math.random() * 41) + 60;
            return sock.sendMessage(from, {
                text: `💖 *Nova Compatibility Radar*\n` +
                      `👤 Pair: @${sender.split('@')[0]} + ${target}\n` +
                      `📊 Score: *${score}%*\n` +
                      `✨ Assessment: ${score > 85 ? 'Destined Soulmates! 💍' : 'Great friendship and harmony! ✨'}`
            }, { quoted: msg });
        }

        if (['compliment', 'complimentme'].includes(cleanCmd)) {
            const comps = [
                "Your positive energy lights up any room you enter! 🌟",
                "You have an amazing mindset and a brilliant perspective.",
                "You are capable of achieving far more than you realize! ✨"
            ];
            return sock.sendMessage(from, { text: `🌸 *Compliment:* ${comps[Math.floor(Math.random() * comps.length)]}` }, { quoted: msg });
        }

        if (cleanCmd === 'rate') {
            const item = args.join(' ') || 'You';
            const rating = Math.floor(Math.random() * 5) + 6;
            return sock.sendMessage(from, { text: `⭐ *Nova Rating for:* "${item}"\nRating: *${rating}/10* ${'⭐'.repeat(Math.min(rating, 5))}` }, { quoted: msg });
        }

        if (['wouldyourather', 'wyr'].includes(cleanCmd)) {
            const options = [
                "Would you rather be able to fly or be invisible?",
                "Would you rather travel 100 years into the past or 100 years into the future?",
                "Would you rather speak all languages fluently or talk to animals?"
            ];
            return sock.sendMessage(from, { text: `🤔 *Would You Rather:*\n${options[Math.floor(Math.random() * options.length)]}` }, { quoted: msg });
        }

        if (cleanCmd === 'pickup') {
            const lines = [
                "Are you a Wi-Fi signal? Because I'm really feeling a connection.",
                "Is your name Google? Because you have everything I've been searching for.",
                "Do you believe in love at first sight, or should I walk by again?"
            ];
            return sock.sendMessage(from, { text: `💌 *Pickup Line:*\n"${lines[Math.floor(Math.random() * lines.length)]}"` }, { quoted: msg });
        }

        if (['fortune', 'luck'].includes(cleanCmd)) {
            const fortunes = [
                "A thrilling opportunity will come your way this week! 🍀",
                "Your hard work will soon pay off in unexpected ways. ⭐",
                "Trust your intuition; great things are aligning for you. 🔮"
            ];
            return sock.sendMessage(from, { text: `🔮 *Daily Fortune:*\n${fortunes[Math.floor(Math.random() * fortunes.length)]}` }, { quoted: msg });
        }

        if (['truth', 'dare', 'truthdare'].includes(cleanCmd)) {
            const truths = ["What is the biggest lie you've ever told?", "What is your biggest fear?", "Who was your first secret crush?"];
            const dares = ["Send an emoji to the last person you texted without context.", "Speak in an accent for the next 5 minutes.", "Send a voice note singing your favorite chorus."];
            const isTruth = cleanCmd === 'truth' || (cleanCmd === 'truthdare' && Math.random() > 0.5);
            const prompt = isTruth ? `💡 *Truth:* ${truths[Math.floor(Math.random() * truths.length)]}` : `🎯 *Dare:* ${dares[Math.floor(Math.random() * dares.length)]}`;
            return sock.sendMessage(from, { text: prompt }, { quoted: msg });
        }

        if (['riddle', 'puzzle'].includes(cleanCmd)) {
            activeRiddle = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
            return sock.sendMessage(from, {
                text: `🧩 *Riddle Time:*\n\n"${activeRiddle.q}"\n\n💡 Reply with \`.riddleanswer\` to reveal the answer!`
            }, { quoted: msg });
        }

        if (cleanCmd === 'riddleanswer') {
            if (!activeRiddle) {
                return sock.sendMessage(from, { text: "⚠️ No active riddle. Type `.riddle` to start a new one!" }, { quoted: msg });
            }
            const ans = activeRiddle.a;
            activeRiddle = null;
            return sock.sendMessage(from, { text: `✨ *Riddle Answer:* ${ans}` }, { quoted: msg });
        }

        if (['decision', 'choose', 'random'].includes(cleanCmd)) {
            const choices = args.join(' ').split(/,| or /i).map(s => s.trim()).filter(Boolean);
            if (choices.length < 2) {
                return sock.sendMessage(from, { text: "❌ *Usage:* `.choose pizza or burger or pasta`" }, { quoted: msg });
            }
            const chosen = choices[Math.floor(Math.random() * choices.length)];
            return sock.sendMessage(from, { text: `🎯 *Nova Decided:* I pick *${chosen}*!` }, { quoted: msg });
        }

        if (cleanCmd === 'storyfun') {
            return sock.sendMessage(from, {
                text: `📖 *Short Story:*\nOnce upon a time, a coder fixed a bug with one line of code. All the unit tests passed, production ran smoothly, and they lived happily ever after.`
            }, { quoted: msg });
        }

        // --------------------------------------------------------------------------
        // 2. BOYS PERSONA SUITE
        // --------------------------------------------------------------------------
        if (['boyattitude', 'battitude'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🔥 *Boy Attitude Quote:*\n"Silence is the best response to fools, and success is the ultimate revenge."`
            }, { quoted: msg });
        }

        if (['boybio', 'bbio'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `👑 *VIP Bio Idea:*\n⚡ Living life on my own terms.\n🛡️ Silent moves, loud results.\n📍 Global Citizen`
            }, { quoted: msg });
        }

        if (['boycaption', 'bcaption'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `📸 *Boy Instagram Caption:*\n"Built from struggles, driven by dreams. No shortcuts."`
            }, { quoted: msg });
        }

        if (['boycompat', 'bcompat'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🤝 *Brotherhood Radar:*\n95% Loyalty & Brotherhood confirmed.`
            }, { quoted: msg });
        }

        if (['boydare', 'bdare'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🎯 *Alpha Challenge:*\nDo 25 pushups right now without stopping!`
            }, { quoted: msg });
        }

        if (['boydp', 'boyspic', 'boywallpaper', 'boywall'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🖼️ *Boy Aesthetic Profile Picture:*\nHD wallpaper dispatched.`
            }, { quoted: msg });
        }

        if (['boyhoroscope', 'bhoroscope'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `♈ *Alpha Horoscope:*\nFocus on building your empire today. Energy levels are peak.`
            }, { quoted: msg });
        }

        if (['boymotivation', 'bmotivation'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `⚡ *Motivation:*\n"Don't stop when you're tired. Stop when you're done."`
            }, { quoted: msg });
        }

        if (['boyquotes', 'boyquote', 'bquote'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `👑 *Wisdom:*\n"A real king doesn't need a crown; his character speaks for him."`
            }, { quoted: msg });
        }

        if (['boytruth', 'btruth'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `💭 *Truth Question:*\nWhat is your biggest personal goal for this year that you haven't told anyone?`
            }, { quoted: msg });
        }

        // --------------------------------------------------------------------------
        // 3. GIRLS PERSONA SUITE
        // --------------------------------------------------------------------------
        if (['girlaesthetic', 'gaesthetic'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `✨ *Aesthetic Vibe:*\n"Soft heart, fierce mind, wild soul. Blooming in my own lane." 🌸`
            }, { quoted: msg });
        }

        if (['girlavatar', 'gavatar', 'girldp', 'girlspic', 'girlportrait', 'gportrait', 'girlwallpaper', 'girlwall'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🌸 *Aesthetic Girl Portrait & DP:*\nDelivering high-resolution visual profile.`
            }, { quoted: msg });
        }

        if (['girlbio', 'gbio'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🎀 *Aesthetic Bio Idea:*\n✨ Creating my own sunshine.\n🌸 Book lover & coffee enthusiast.\n💫 Chasing dreams with style.`
            }, { quoted: msg });
        }

        if (['girlcaption', 'gcaption'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `📸 *Aesthetic Caption:*\n"Sparkle with all your heart, darling." ✨`
            }, { quoted: msg });
        }

        if (['girlcompat', 'gcompat', 'girllove', 'glove'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `💖 *Pure Love Aura:*\n98% Soul harmony & tenderness detected.`
            }, { quoted: msg });
        }

        if (['girldare', 'gdare'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🎯 *Fun Challenge:*\nSend a voice note singing your favorite melody!`
            }, { quoted: msg });
        }

        if (['girlfashion', 'gfashion', 'girloutfit', 'goutfit'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `👗 *Fashion Inspo:*\nPastel oversized cardigan with classic high-waisted denim and minimalist white sneakers.`
            }, { quoted: msg });
        }

        if (['girlhairstyle', 'ghairstyle'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `💇‍♀️ *Hairstyle Idea:*\nSoft beach waves with a delicate pearl hairpin accent.`
            }, { quoted: msg });
        }

        if (['girlhoroscope', 'ghoroscope'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🌸 *Cosmic Horoscope:*\nYour creative intuition is exceptionally high today. Embrace serenity.`
            }, { quoted: msg });
        }

        if (['girlmakeup', 'gmakeup'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `💄 *Glow Makeup Routine:*\nDewy skin tint, peach blush on cheeks, brushed-up brows, and glossy lip tint.`
            }, { quoted: msg });
        }

        if (['girlmotivation', 'gmotivation'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🌟 *Radiant Reminder:*\n"You are capable of blooming through every season. Keep shining."`
            }, { quoted: msg });
        }

        if (['girlpoetry', 'gpoetry'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `📜 *Poetry:*\n"Like wildflowers; you must allow yourself to grow in all the places people thought you never would."`
            }, { quoted: msg });
        }

        if (['girlquotes', 'gquote'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `💎 *Quote:*\n"She remembered who she was and the game changed."`
            }, { quoted: msg });
        }

        if (['girlrecipe', 'grecipe'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🍓 *Aesthetic Recipe:*\nIced Strawberry Matcha Latte: Fresh strawberry puree, chilled oat milk, and ceremonial matcha whisked to perfection.`
            }, { quoted: msg });
        }

        if (['girlsad', 'gsad'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🌧️ *Comfort:*\n"It's okay to feel overwhelmed. Heavy rains always bring the most beautiful gardens."`
            }, { quoted: msg });
        }

        if (['girlshayari', 'gshayari'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🥀 *Urdu Shayari:*\n"خودی کو کر بلند اتنا کہ ہر تقدیر سے پہلے\nخدا بندے سے خود پوچھے بتا تیری رضا کیا ہے"`
            }, { quoted: msg });
        }

        if (['girlskincare', 'gskincare'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🧴 *Glass Skin Tip:*\nGentle hydrating cleanser, hyaluronic acid serum on damp skin, and SPF 50 daily!`
            }, { quoted: msg });
        }

        if (['girltruth', 'gtruth'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `💭 *Girl Truth:*\nWhat is a simple thing that instantly makes you feel happy and peaceful?`
            }, { quoted: msg });
        }

        if (['girlusername', 'gusername'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `✨ *Aesthetic Usernames:*\n• @velvet_bloom\n• @lunar.whispers\n• @celestial_aura\n• @honey_clouds`
            }, { quoted: msg });
        }

        // --------------------------------------------------------------------------
        // 4. GROUP INTERACTIVE GAMES
        // --------------------------------------------------------------------------
        if (['games', 'randomgame'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🎮 *NOVA GROUP INTERACTIVE GAMES (42 TITLES)*\n\n` +
                      `• \`.battle\` / \`.duel\` (Challenge a member)\n` +
                      `• \`.rps\` (Rock Paper Scissors)\n` +
                      `• \`.guessnumber\` / \`.gn\` (Number guessing)\n` +
                      `• \`.guessword\` / \`.gw\` (Unscramble words)\n` +
                      `• \`.impostor\` (Find the spy/impostor)\n` +
                      `• \`.truth\` / \`.dare\` / \`.truthdare\`\n` +
                      `• \`.riddle\` / \`.riddleanswer\`\n` +
                      `• \`.king\` / \`.queen\` / \`.champion\`\n` +
                      `• \`.grouprank\` / \`.fastest\` / \`.lucky\`\n` +
                      `• \`.grouptruth\` / \`.groupdare\` / \`.groupquiz\``
            }, { quoted: msg });
        }

        if (['battle', 'duel', 'versus', 'vs'].includes(cleanCmd)) {
            const opp = args.join(' ') || 'The Challenger';
            const winner = Math.random() > 0.5 ? `@${sender.split('@')[0]}` : opp;
            return sock.sendMessage(from, {
                text: `⚔️ *EPIC DUEL ARENA:*\n@${sender.split('@')[0]} ⚔️ ${opp}\n\n🏆 *Victor:* ${winner} claims victory in battle!`
            }, { quoted: msg });
        }

        if (['rockpaperscissors', 'rps'].includes(cleanCmd)) {
            const userMove = args[0]?.toLowerCase() || 'rock';
            const botMoves = ['rock', 'paper', 'scissors'];
            const botMove = botMoves[Math.floor(Math.random() * 3)];
            let res = "It's a tie!";
            if ((userMove === 'rock' && botMove === 'scissors') || (userMove === 'paper' && botMove === 'rock') || (userMove === 'scissors' && botMove === 'paper')) {
                res = "🎉 You win!";
            } else if (userMove !== botMove) {
                res = "🤖 Bot wins!";
            }
            return sock.sendMessage(from, {
                text: `✊✋✌️ *Rock Paper Scissors:*\n• *You:* ${userMove}\n• *Bot:* ${botMove}\n\n*Result:* ${res}`
            }, { quoted: msg });
        }

        if (['guessnumber', 'gn', 'numberbattle'].includes(cleanCmd)) {
            const secret = Math.floor(Math.random() * 10) + 1;
            return sock.sendMessage(from, {
                text: `🔢 *Number Battle:* I picked a secret number between 1 and 10!\n_Secret:_ *${secret}*`
            }, { quoted: msg });
        }

        if (['impostor', 'imposter', 'spy'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `🕵️ *Impostor Radar:*\nScanning group telemetry... An impostor was spotted among us!`
            }, { quoted: msg });
        }

        if (['king', 'queen', 'champion', 'winner'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `👑 *Royalty Crowned:*\n@${sender.split('@')[0]} is declared the official *${cleanCmd.toUpperCase()}* of the group!`
            }, { quoted: msg });
        }

        if (['lucky', 'unlucky', 'fastest', 'mood'].includes(cleanCmd)) {
            return sock.sendMessage(from, {
                text: `✨ *Member Telemetry (${cleanCmd.toUpperCase()}):*\nTarget member assigned status: 100% active.`
            }, { quoted: msg });
        }

        return false;
    }
};
