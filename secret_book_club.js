document.addEventListener('DOMContentLoaded', () => {
    const game = new SecretBookClub();
    game.init();
});

class SecretBookClub {
    constructor() {
        this.titles = [];
        this.secretTitle = "";
        this.guesses = []; // Array of strings (book titles)
        this.gameArea = document.getElementById('game-area');
        this.messageArea = document.getElementById('message-area');
        this.won = false;
    }

    async init() {
        await this.loadTitles();
        this.pickSecret();
        this.setupNavigation();
        // Initialize guesses with boundaries if they aren't meant to be "guesses" per se, 
        // but the prompt says: "We put the first and last titles from the controlled list"
        // so we treat them as visually present but maybe not user "guesses".
        // Let's just store "displayedItems" which includes start/end + user guesses.
        this.render();
    }

    setupNavigation() {
        const moreGamesBtn = document.getElementById('more-games-btn');
        const moreGamesMenu = document.getElementById('more-games-menu');
        if (moreGamesBtn && moreGamesMenu) {
            moreGamesBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreGamesMenu.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                moreGamesMenu.classList.remove('show');
            });
        }
    }

    async loadTitles() {
        try {
            const response = await fetch('data/titles.txt');
            const text = await response.text();
            // Split by lines, trim, filter empty
            this.titles = text.split('\n')
                .map(t => t.trim())
                .filter(t => t.length > 0)
                .sort((a, b) => a.localeCompare(b));
        } catch (e) {
            console.error("Failed to load titles:", e);
            this.messageArea.textContent = "Error loading book titles.";
        }
    }

    pickSecret() {
        if (this.titles.length === 0) return;
        const randomIndex = Math.floor(Math.random() * this.titles.length);
        this.secretTitle = this.titles[randomIndex];
        console.log("Secret Book:", this.secretTitle); // For debugging
    }

    handleGuess(guess) {
        if (this.won) return;

        // Exact match check (case insensitive for user convenience, but we use strict casing from list)
        const match = this.titles.find(t => t.toLowerCase() === guess.toLowerCase());

        if (!match) {
            this.showMessage("Please select a title from the list.");
            return;
        }

        if (this.guesses.includes(match)) {
            this.showMessage("You already guessed that!");
            return;
        }

        this.guesses.push(match);
        this.guesses.sort((a, b) => a.localeCompare(b));

        if (match === this.secretTitle) {
            this.won = true;
            this.showMessage(`Correct! The book was "${this.secretTitle}"`);
        } else {
            this.showMessage("");
        }

        this.render();
    }

    showMessage(msg) {
        this.messageArea.textContent = msg;
    }

    render() {
        this.gameArea.innerHTML = '';

        if (this.titles.length === 0) return;

        // Construct the list of items to display: First Title ... Guesses ... Last Title
        // The input box should go in the "gap" where the secret title belongs.

        const startTitle = this.titles[0];
        const endTitle = this.titles[this.titles.length - 1];

        // displayedItems includes the fixed boundaries AND user guesses.
        // We use a Set to avoid duplicates if secret or user guess happens to be first/last (unlikely but possible).
        const itemsToDisplay = new Set([startTitle, ...this.guesses, endTitle]);
        const sortedDisplayItems = Array.from(itemsToDisplay).sort((a, b) => a.localeCompare(b));

        // Find insertion index for the secret title to determine where the Input Box goes.
        // We want to find the two items in sortedDisplayItems that "sandwich" the secretTitle.

        let lowerBound = null;
        let upperBound = null;

        for (let i = 0; i < sortedDisplayItems.length; i++) {
            const item = sortedDisplayItems[i];
            if (item.localeCompare(this.secretTitle) < 0) {
                lowerBound = item;
            } else if (item.localeCompare(this.secretTitle) > 0) {
                if (upperBound === null) {
                    upperBound = item;
                }
            } else {
                // Item IS the secret title (Game Won)
                // If game is won, we just display the sorted list with the secret title revealed/highlighted.
            }
        }

        // Render loop
        sortedDisplayItems.forEach(item => {
            // Check if we need to insert the input box BEFORE this item?
            // Actually, easier logic:
            // Input box goes between `lowerBound` and `upperBound`.

            // If item is the upperBound, and we haven't won, insert Input before it.
            // Wait, what if secret is greater than ALL guesses?
            // "lowerBound" would be the last guess. "upperBound" would be null? 
            // BUT we always have endTitle. So upperBound is guaranteed unless secret > endTitle (impossible).
            // Same for lowerBound (startTitle).

            if (!this.won && item === upperBound) {
                this.renderInputBox(lowerBound, upperBound);
            }

            this.renderItem(item);
        });
    }

    renderItem(text) {
        const div = document.createElement('div');
        div.classList.add('guess-block');
        div.textContent = text;
        if (text === this.secretTitle && this.won) {
            div.classList.add('winner');
        }
        this.gameArea.appendChild(div);
    }

    renderInputBox(min, max) {
        const div = document.createElement('div');
        div.classList.add('input-container');

        const helperText = document.createElement('div');
        helperText.classList.add('helper-text');
        helperText.textContent = `The book is alphabetically between "${min}" and "${max}"`;
        div.appendChild(helperText);

        const form = document.createElement('form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleGuess(input.value);
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('list', 'titles-list');
        input.placeholder = 'Guess the book...';
        input.classList.add('game-input');

        const datalist = document.createElement('datalist');
        datalist.id = 'titles-list';
        this.titles.forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            datalist.appendChild(option);
        });

        form.appendChild(input);
        form.appendChild(datalist);

        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.textContent = 'Guess';
        btn.classList.add('btn-guess');
        form.appendChild(btn);

        div.appendChild(form);
        this.gameArea.appendChild(div);

        // Auto-focus input
        setTimeout(() => input.focus(), 0);
    }
}
