class CryptoGame {
    constructor() {
        this.records = [];
        this.currentRecord = null;
        this.cipherMap = {}; // Maps 'A' -> Number (1, 23, etc.)
        this.reverseCipherMap = {}; // Maps Number -> 'A'
        this.userGuesses = {}; // Maps Number -> 'A' (char guessed by user)
        this.revealedNumbers = new Set(); // Numbers that are permanently revealed (hints)
        this.selectedNumber = null;

        // Fields to display
        this.displayFields = [
            '245', '100', '264', '520', '600', '650', '651', '655', '700'
        ];

        this.fieldLabels = {
            '245': 'Title',
            '100': 'Author',
            '264': 'Publication',
            '600': 'Topic',
            '650': 'Topic',
            '520': 'Summary',
            '651': 'Geographic',
            '655': 'Genre',
            '700': 'Contributor'
        };

        this.subfieldConfig = {
            '100': ['a', 'd'],
            '264': ['c'],
            'default': ['a']
        };
    }

    async init() {
        await this.loadData();
        this.setupControls();
        this.startNewRound();

        // Global keyboard listener
        document.addEventListener('keydown', (e) => this.handleKeyInput(e));
    }

    async loadData() {
        try {
            const response = await fetch('data/test.mrc');
            if (!response.ok) throw new Error("Failed to load data");
            const buffer = await response.arrayBuffer();
            const parser = new MarcParser();
            this.records = parser.parse(buffer);
        } catch (e) {
            console.error(e);
            document.getElementById('message').textContent = "Error loading MARC data.";
        }
    }

    startNewRound() {
        if (this.records.length === 0) return;

        // Reset state
        const randomIndex = Math.floor(Math.random() * this.records.length);
        this.currentRecord = this.records[randomIndex];
        this.userGuesses = {};
        this.revealedNumbers = new Set();
        this.selectedNumber = null;
        this.documentSolved = false;

        this.generateCipher();
        this.revealHints();
        this.render();
        this.updateMessage("Click any blank and type a letter to solve.");
    }

    generateCipher() {
        // Create random mapping for A-Z
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        const numbers = Array.from({ length: 26 }, (_, i) => i + 1);

        // Shuffle numbers
        for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }

        this.cipherMap = {};
        this.reverseCipherMap = {};

        alphabet.forEach((char, index) => {
            const num = numbers[index];
            this.cipherMap[char] = num;
            this.reverseCipherMap[num] = char;
        });
    }

    revealHints() {
        // Collect all used letters in the puzzle first.
        const allUsedLetters = new Set();
        let summaryFound = false;

        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryFound) return;
                    summaryFound = true;
                }
                const subfieldsToShow = this.subfieldConfig[field.tag] || this.subfieldConfig['default'];
                subfieldsToShow.forEach(code => {
                    const sf = field.subfields.find(s => s.code === code);
                    if (sf) {
                        sf.data.toUpperCase().split('').forEach(c => {
                            if (/[A-Z]/.test(c)) allUsedLetters.add(c);
                        });
                    }
                });
            }
        });

        // Convert to array and shuffle
        const distinctLetters = Array.from(allUsedLetters);
        // Fisher-Yates shuffle
        for (let i = distinctLetters.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [distinctLetters[i], distinctLetters[j]] = [distinctLetters[j], distinctLetters[i]];
        }

        // Pick first 4 unique letters (or fewer if total unique < 4)
        const lettersToReveal = distinctLetters.slice(0, 4);

        lettersToReveal.forEach(char => {
            const num = this.cipherMap[char];
            this.revealedNumbers.add(num);
        });
    }

    render() {
        const container = document.getElementById('puzzle-container');
        container.innerHTML = '';

        let summaryDisplayed = false;

        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryDisplayed) return;
                    summaryDisplayed = true;
                }

                const fieldContainer = document.createElement('div');
                fieldContainer.classList.add('crypto-field');

                // Label
                const label = document.createElement('div');
                label.classList.add('field-label');
                label.textContent = this.fieldLabels[field.tag] || field.tag;
                fieldContainer.appendChild(label);

                // Content
                const contentDiv = document.createElement('div');
                contentDiv.classList.add('field-content');

                // Build text
                let textSegments = [];
                const subfieldsToShow = this.subfieldConfig[field.tag] || this.subfieldConfig['default'];
                subfieldsToShow.forEach(code => {
                    const sf = field.subfields.find(s => s.code === code);
                    if (sf) textSegments.push(sf.data);
                });
                const fullText = textSegments.join(' ');

                // Split into words to prevent breaking mid-word weirdly
                const words = fullText.split(' ');

                words.forEach(word => {
                    const wordGroup = document.createElement('div');
                    wordGroup.classList.add('word-group');

                    word.split('').forEach(char => {
                        const upperChar = char.toUpperCase();

                        if (/[A-Z]/.test(upperChar)) {
                            // It's a letter
                            const num = this.cipherMap[upperChar];

                            const stack = document.createElement('div');
                            stack.classList.add('letter-stack');
                            stack.dataset.number = num;
                            if (num === this.selectedNumber) stack.classList.add('selected');

                            stack.onclick = (e) => {
                                e.stopPropagation();
                                this.selectNumber(num, e.currentTarget);
                            };

                            const slot = document.createElement('div');
                            slot.classList.add('letter-slot');

                            // Determine what to show
                            this.updateStackVisuals(stack, num, slot);

                            const numberDiv = document.createElement('div');
                            numberDiv.classList.add('cipher-number');
                            numberDiv.textContent = num;

                            stack.appendChild(slot);
                            stack.appendChild(numberDiv);
                            wordGroup.appendChild(stack);

                        } else {
                            // Punctuation / Number in text
                            const punc = document.createElement('div');
                            punc.classList.add('punctuation-mark');
                            punc.textContent = char;
                            wordGroup.appendChild(punc);
                        }
                    });

                    contentDiv.appendChild(wordGroup);
                    // Add space after word
                    const space = document.createElement('div');
                    space.classList.add('punctuation-mark');
                    space.innerHTML = '&nbsp;';
                    // contentDiv.appendChild(space); // Actually word-group margin handles this, but let's be safe?
                    // The CSS margin-right on word-group handles inter-word spacing better for flow.
                });

                fieldContainer.appendChild(contentDiv);
                container.appendChild(fieldContainer);
            }
        });
    }

    updateStackVisuals(stackEle, num, slotEle) {
        if (this.revealedNumbers.has(num)) {
            slotEle.textContent = this.reverseCipherMap[num];
            slotEle.classList.add('revealed');
            slotEle.classList.remove('user-guess', 'incorrect-guess');
        } else if (this.userGuesses[num]) {
            slotEle.textContent = this.userGuesses[num];
            slotEle.classList.remove('revealed');

            if (this.userGuesses[num] === this.reverseCipherMap[num]) {
                slotEle.classList.add('user-guess');
                slotEle.classList.remove('incorrect-guess');
            } else {
                slotEle.classList.add('incorrect-guess');
                slotEle.classList.remove('user-guess');
            }
        } else {
            slotEle.innerHTML = '&nbsp;';
            slotEle.classList.remove('revealed', 'user-guess', 'incorrect-guess');
        }

        if (num === this.selectedNumber) {
            stackEle.classList.add('selected');
        } else {
            stackEle.classList.remove('selected');
        }
    }

selectNumber(num, targetEle = null) {
    if (this.documentSolved) return;

    // Deselect previous
    if (this.selectedNumber !== null) {
        document.querySelectorAll(`.letter-stack[data-number="${this.selectedNumber}"]`)
            .forEach(el => el.classList.remove('selected'));
    }

    this.selectedNumber = num;

    // Select new
    document.querySelectorAll(`.letter-stack[data-number="${this.selectedNumber}"]`)
        .forEach(el => el.classList.add('selected'));

    // Setup hidden input
    const input = document.getElementById('hidden-input');
    input.style.position = 'absolute';
    input.style.top = '-1000px';
    input.style.left = '-1000px';
    input.value = ''; // Clear previous input

    // Focus without scroll
    input.focus({ preventScroll: true });

    // Delay scroll restoration
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    setTimeout(() => {
        window.scrollTo(scrollX, scrollY);
    }, 100);
}



    handleKeyInput(e) {
        if (this.documentSolved) return;
        if (!this.selectedNumber) return;

        // Ignore modifiers
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const key = e.key.toUpperCase();
        let changed = false;

        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (this.userGuesses[this.selectedNumber]) {
                delete this.userGuesses[this.selectedNumber];
                changed = true;
            }
        } else if (/[A-Z]/.test(key) && key.length === 1) {
            this.userGuesses[this.selectedNumber] = key;
            changed = true;
        }

        if (changed) {
            // Update visuals only for this number
            const stacks = document.querySelectorAll(`.letter-stack[data-number="${this.selectedNumber}"]`);
            stacks.forEach(stack => {
                const slot = stack.querySelector('.letter-slot');
                this.updateStackVisuals(stack, this.selectedNumber, slot);
            });
            this.checkForCompletion();
        }
    }

    checkForCompletion() {
        // Check if every cipher number that exists in the text has a correct value (either revealed or guessed)

        // First, get all numbers present in the puzzle.
        // We can scan the text again, or just derive from what we generated.
        // Actually, we generated 1-26, but not all might be used.
        // Better to iterate the displayed text and verify.

        let allCorrect = true;
        let isComplete = true; // Are all slots filled?

        // We can just iterate the map. If a number is USED in the text...
        // Let's assume we validate against the full text content we generated.

        // Simple way:
        for (let char in this.cipherMap) {
            const num = this.cipherMap[char];
            // Check if this number is actually used in the displayed record?
            // Optimization: we could track usedNumbers during render or init.
            // For now, let's assume if it's in the map, we check it. 
            // Wait, map has ALL 26 chars. Some might not be in the text.
            // If the user hasn't guessed it, is it wrong?
            // Only strictly enforce visible slots.
        }

        // Let's re-scan the record text to see what's actually on screen.
        let usedNumbers = new Set();

        let summaryFound = false;
        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryFound) return;
                    summaryFound = true;
                }
                const subfieldsToShow = this.subfieldConfig[field.tag] || this.subfieldConfig['default'];
                subfieldsToShow.forEach(code => {
                    const sf = field.subfields.find(s => s.code === code);
                    if (sf) {
                        sf.data.toUpperCase().split('').forEach(c => {
                            if (/[A-Z]/.test(c)) usedNumbers.add(this.cipherMap[c]);
                        });
                    }
                });
            }
        });

        for (let num of usedNumbers) {
            const correctChar = this.reverseCipherMap[num];
            // Is it revealed?
            if (this.revealedNumbers.has(num)) continue;

            // Is it guessed correctly?
            const userChar = this.userGuesses[num];
            if (!userChar) {
                isComplete = false;
                break;
            }
            if (userChar !== correctChar) {
                allCorrect = false;
            }
        }

        if (isComplete && allCorrect) {
            this.documentSolved = true;
            this.updateMessage("CONGRATULATIONS! You solved the catalog!");
            // Reveal all (visual effect?)
            // Add confetti? (out of scope but nice)
            if (window.confetti) {
                window.confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
        } else if (isComplete && !allCorrect) {
            this.updateMessage("Puzzle full, but something is wrong...");
        } else {
            this.updateMessage("Keep going...");
        }
    }

    setupControls() {
        document.getElementById('btn-newgame').addEventListener('click', () => this.startNewRound());
        document.getElementById('btn-giveup').addEventListener('click', () => {
            if (this.documentSolved) return;
            // Reveal all
            for (let num in this.reverseCipherMap) {
                this.revealedNumbers.add(parseInt(num));
            }
            this.documentSolved = true; // effectively
            this.render();
            this.updateMessage("Solution Revealed.");
        });

        // Listen for typing into the hidden input (for mobile)
        const hiddenInput = document.getElementById('hidden-input');

        // Primary: beforeinput (handles composition-aware input on many platforms)
        hiddenInput.addEventListener('beforeinput', (e) => {
            if (!this.selectedNumber) return;

            // Handle delete/backspace via inputType
            if (e.inputType === 'deleteContentBackward') {
                this.handleKeyInput({ key: 'Backspace' });
                e.preventDefault();
                hiddenInput.value = '';
                return;
            }

            // Handle single-letter input when available
            if (e.data && /^[a-zA-Z]$/.test(e.data)) {
                this.handleKeyInput({ key: e.data.toUpperCase() });
                e.preventDefault();
                hiddenInput.value = '';
            }
        });

        // Fallback: input event (covers some Android keyboards that don't reliably fire beforeinput)
        hiddenInput.addEventListener('input', (e) => {
            if (!this.selectedNumber) return;
            const val = e.target.value || '';
            if (!val) return;
            const ch = val.slice(-1);
            if (/^[a-zA-Z]$/.test(ch)) {
                this.handleKeyInput({ key: ch.toUpperCase() });
            }
            // Always clear the field so next input will be reported
            e.target.value = '';
        });

        // Capture Backspace on keydown as an additional fallback
        hiddenInput.addEventListener('keydown', (e) => {
            if (!this.selectedNumber) return;
            if (e.key === 'Backspace') {
                this.handleKeyInput({ key: 'Backspace' });
                e.preventDefault();
            }
        });

    }

    updateMessage(msg) {
        document.getElementById('message').textContent = msg;
    }
    
}


document.addEventListener('DOMContentLoaded', () => {
    const game = new CryptoGame();
    game.init();
});