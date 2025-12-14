document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});

class Game {
    constructor() {
        this.records = [];
        this.currentRecord = null;
        this.guessedLetters = new Set();
        this.lives = 6;
        this.won = false;
        this.lost = false;

        // Relevant fields to display
        this.displayFields = [
            '100', '245', '520', '600', '650', '651', '655', '700'
        ];

        this.fieldLabels = {
            '245': 'Title',
            '100': 'Author',
            '600': 'Topic',
            '650': 'Topic',
            '520': 'Summary',
            '651': 'Geographic',
            '655': 'Genre',
            '700': 'Contributor'
        };
    }

    async init() {
        await this.loadData();
        this.setupKeyboard();
        this.setupGameControls();
        this.startNewRound();

        document.getElementById('next-record').addEventListener('click', () => {
            this.startNewRound();
        });
    }

    async loadData() {
        try {
            const response = await fetch('data/test.mrc');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const buffer = await response.arrayBuffer();
            const parser = new MarcParser();
            this.records = parser.parse(buffer);
            console.log(`Loaded ${this.records.length} records.`);
        } catch (e) {
            console.error("Failed to load MARC data:", e);
            document.getElementById('message').textContent = "Error loading data. Ensure data/test.mrc exists.";
        }
    }

    startNewRound() {
        if (this.records.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.records.length);
        this.currentRecord = this.records[randomIndex];
        this.guessedLetters.clear();
        this.lives = 6;
        this.won = false;
        this.lost = false;

        this.updateUI();
    }

    setupKeyboard() {
        const keyboard = document.getElementById('keyboard');
        const updatedKeyboardInnerHTML = '';
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

        alphabet.split('').forEach(char => {
            const btn = document.createElement('button');
            btn.textContent = char;
            btn.classList.add('key');
            btn.dataset.key = char;
            btn.addEventListener('click', () => this.handleGuess(char));
            keyboard.appendChild(btn);
        });

        // Also handle physical keyboard
        document.addEventListener('keydown', (e) => {
            const char = e.key.toUpperCase();
            if (alphabet.includes(char)) {
                this.handleGuess(char);
            }
        });
    }

    setupGameControls() {
        document.getElementById('btn-giveup').addEventListener('click', () => this.giveUp());
        document.getElementById('btn-newgame').addEventListener('click', () => this.startNewRound());
    }

    giveUp() {
        if (this.won || this.lost) return;
        this.lost = true;
        this.lives = 0;
        this.updateUI();
    }

    handleGuess(char) {
        if (this.won || this.lost || this.guessedLetters.has(char)) return;

        this.guessedLetters.add(char);

        // Check if the guess is "correct" (appears in the puzzle)
        // Actually, in Redactle/Hangman, do we penalize for letters NOT in the HIDDEN title?
        // Or not in ANY field?
        // Requirement: "The user will guess one letter at a time ... and all instances of that letter across all fields will be revealed"
        // "6 wrong guesses and they lost"
        // Usually "wrong" means "not in the puzzle". 
        // Let's assume "puzzle" means the entire set of visible fields? 
        // Or just the winning field (245$a)? 
        // User said: "When 245 $a is fully revealed, then the player has won. 6 wrong guesses and they lost"
        // Typically in Hangman, a guess is valid if it appears ANYWHERE.

        const content = this.getAllContent();
        if (!content.toUpperCase().includes(char)) {
            this.lives--;
        }

        this.checkWinCondition();
        this.updateUI();
    }

    getAllContent() {
        if (!this.currentRecord) return "";
        let content = "";
        let summaryFound = false;
        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryFound) return;
                    summaryFound = true;
                }
                field.subfields.forEach(sf => {
                    if (sf.code === 'a') content += sf.data;
                    // Note: User only listed $a for most, but we might want to be robust.
                    // Requirement says "context fields present: ... 650 $a ... etc"
                    // So we stick to $a for now.
                });
            }
        });
        return content;
    }

    checkWinCondition() {
        if (this.lives <= 0) {
            this.lost = true;
            this.lives = 0;
            return;
        }

        // Win if 245$a is fully revealed
        const titleField = this.currentRecord.fields.find(f => f.tag === '245');
        if (titleField && titleField.subfields) {
            const titleSubfield = titleField.subfields.find(sf => sf.code === 'a');
            if (titleSubfield) {
                const titleText = titleSubfield.data.toUpperCase();
                const isFullyRevealed = titleText.split('').every(char => {
                    return !this.isAlphaNumeric(char) || this.guessedLetters.has(char);
                });

                if (isFullyRevealed) {
                    this.won = true;
                }
            }
        }
    }

    isAlphaNumeric(char) {
        return /[A-Z0-9]/.test(char);
    }

    updateUI() {
        // Update Lives
        document.getElementById('lives').textContent = `Lives: ${this.lives}`;

        // Update Message
        const msgEl = document.getElementById('message');
        if (this.won) msgEl.textContent = "YOU WON!";
        else if (this.lost) msgEl.textContent = "GAME OVER";
        else msgEl.textContent = "";

        // Update Puzzle Area
        const container = document.getElementById('puzzle-container');
        container.innerHTML = '';

        if (!this.currentRecord) return;

        let summaryDisplayed = false;

        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryDisplayed) return; // Only accept the first 520
                    summaryDisplayed = true;
                }

                // Find subfield a
                const sf = field.subfields.find(s => s.code === 'a');
                if (sf) {
                    const fieldDiv = document.createElement('div');
                    fieldDiv.classList.add('marc-field');

                    const tagSpan = document.createElement('span');
                    tagSpan.classList.add('field-tag');
                    // Use label if available, otherwise tag
                    tagSpan.textContent = this.fieldLabels[field.tag] || field.tag;
                    fieldDiv.appendChild(tagSpan);

                    const contentDiv = document.createElement('span');
                    contentDiv.classList.add('field-content');

                    // Render logic
                    let text = sf.data;
                    // We need to tokenize by words to handle wrapping nicely? 
                    // Or just chars. CSS handles wrapping.
                    // But we want to group "words" for better "hangman" feel logic if needed.
                    // Simple char rendering:

                    const chars = text.split('');
                    chars.forEach(char => {
                        const charSpan = document.createElement('span');
                        charSpan.classList.add('char');

                        const upperChar = char.toUpperCase();

                        if (this.isAlphaNumeric(upperChar)) {
                            // If game over (lost), reveal everything but maybe style differently?
                            if (this.lost || this.won || this.guessedLetters.has(upperChar)) {
                                charSpan.classList.add('revealed');
                                charSpan.textContent = char;
                            } else {
                                charSpan.textContent = "_"; // Placeholder for spacing
                            }
                        } else if (char === ' ') {
                            charSpan.classList.add('space');
                            charSpan.innerHTML = '&nbsp;';
                        } else {
                            // Punctuation
                            charSpan.classList.add('punctuation');
                            charSpan.textContent = char;
                        }

                        contentDiv.appendChild(charSpan);
                    });

                    fieldDiv.appendChild(contentDiv);
                    container.appendChild(fieldDiv);
                }
            }
        });

        // Update Keyboard
        const keys = document.querySelectorAll('.key');
        keys.forEach(key => {
            if (this.guessedLetters.has(key.dataset.key)) {
                key.disabled = true;
            } else {
                key.disabled = false;
            }
        });

        // Update Game Action Buttons
        const giveUpBtn = document.getElementById('btn-giveup');
        const newGameBtn = document.getElementById('btn-newgame');

        if (this.won || this.lost) {
            giveUpBtn.classList.add('hidden');
            newGameBtn.classList.remove('hidden');
        } else {
            giveUpBtn.classList.remove('hidden');
            newGameBtn.classList.add('hidden');
        }
    }
}
