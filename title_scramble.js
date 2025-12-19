class TitleScramble {
    constructor() {
        this.puzzles = [];
        this.currentPuzzles = [];
        this.currentIndex = 0;
        this.score = 0;
        this.timeLimit = 30;
        this.timeRemaining = this.timeLimit;
        this.timer = null;
        this.gameActive = false;
        this.hintUsed = false;
        this.selectedTiles = [];
        this.answerTiles = [];
        this.stats = this.loadStats();
        this.gameContainer = document.getElementById('game-container');
    }

    async init() {
        await this.loadPuzzles();
        this.setupStatsModal();
        this.startCountdown();
        
        const today = this.getTodayString();
        const alreadyPlayed = this.stats.history[today];
        
        if (alreadyPlayed) {
            this.showCompletionScreen(alreadyPlayed.score);
        } else {
            this.startGame();
        }
    }

    async loadPuzzles() {
        try {
            const response = await fetch('data/unscramble.csv');
            if (!response.ok) throw new Error('Failed to load puzzles');
            
            const text = await response.text();
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            
            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length >= 4) {
                    const id = parts[0].trim();
                    const date = parts[1].trim();
                    const title = parts[2].trim();
                    const year = parts[3].trim();
                    this.puzzles.push({ id, date, title, year });
                }
            }
        } catch (e) {
            console.error('Error loading puzzles:', e);
            this.gameContainer.innerHTML = '<p>Error loading puzzle data.</p>';
        }
    }

    getTodayString() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    startGame() {
        const today = this.getTodayString();
        this.currentPuzzles = this.puzzles.filter(p => p.date === today);
        
        if (this.currentPuzzles.length === 0) {
            this.gameContainer.innerHTML = '<p>No puzzles available for today.</p>';
            return;
        }

        // Shuffle puzzles for variety
        this.shuffleArray(this.currentPuzzles);
        
        this.currentIndex = 0;
        this.score = 0;
        this.gameActive = true;
        this.startTimer();
        this.loadPuzzle();
    }

    startTimer() {
        this.timeRemaining = this.timeLimit;
        this.timer = setInterval(() => {
            this.timeRemaining--;
            this.updateTimerDisplay();
            
            if (this.timeRemaining <= 0) {
                this.endGame();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    updateTimerDisplay() {
        const timerEl = document.getElementById('timer');
        if (timerEl) {
            timerEl.textContent = this.timeRemaining;
            if (this.timeRemaining <= 10) {
                timerEl.classList.add('warning');
            } else {
                timerEl.classList.remove('warning');
            }
        }
    }

    loadPuzzle() {
        if (this.currentIndex >= this.currentPuzzles.length) {
            this.currentIndex = 0;
        }

        this.hintUsed = false;
        this.selectedTiles = [];
        this.answerTiles = [];
        this.render();
    }

    scrambleTitle(title) {
        const words = title.split(' ');
        const scrambled = [];
        
        for (let word of words) {
            const chars = word.split('');
            this.shuffleArray(chars);
            scrambled.push(chars.join(''));
        }
        
        return scrambled.join(' ');
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    render() {
        if (!this.gameActive) return;

        const puzzle = this.currentPuzzles[this.currentIndex];
        const scrambled = this.scrambleTitle(puzzle.title);
        
        this.gameContainer.innerHTML = `
            <div class="game-header">
                <div class="timer-display" id="timer">${this.timeRemaining}</div>
                <div class="round-info">Round ${this.currentIndex + 1} of ${this.currentPuzzles.length}</div>
                <div class="score-display">Score: ${this.score}/${this.currentPuzzles.length}</div>
            </div>

            <div class="hint-display" id="hint-display">
                ${this.hintUsed ? `Published: ${puzzle.year}` : ''}
            </div>

            <div class="scrambled-tiles" id="scrambled-tiles"></div>

            <div class="answer-area ${this.answerTiles.length > 0 ? 'has-tiles' : ''}" id="answer-area"></div>

            <div class="feedback-message" id="feedback"></div>

            <div class="game-controls">
                <button class="btn-control btn-submit" id="btn-submit">Submit</button>
                <button class="btn-control btn-skip" id="btn-skip">Skip</button>
                <button class="btn-control btn-clear" id="btn-clear">Clear</button>
                <button class="btn-control btn-shuffle" id="btn-shuffle">Shuffle</button>
                <button class="btn-control btn-hint" id="btn-hint" ${this.hintUsed ? 'disabled' : ''}>
                    Hint
                </button>
            </div>
        `;

        this.renderTiles(scrambled);
        this.attachEventListeners();
    }

    renderTiles(scrambled) {
        const scrambledContainer = document.getElementById('scrambled-tiles');
        const answerContainer = document.getElementById('answer-area');
        
        if (!scrambledContainer || !answerContainer) return;

        // Render scrambled tiles
        scrambledContainer.innerHTML = '';
        const chars = scrambled.split('');
        
        chars.forEach((char, index) => {
            if (char === ' ') {
                const spaceTile = document.createElement('div');
                spaceTile.classList.add('tile', 'space');
                scrambledContainer.appendChild(spaceTile);
            } else if (!this.selectedTiles.includes(index)) {
                const tile = document.createElement('div');
                tile.classList.add('tile');
                tile.textContent = char;
                tile.dataset.index = index;
                tile.addEventListener('click', () => this.selectTile(index, char));
                scrambledContainer.appendChild(tile);
            }
        });

        // Render answer tiles
        answerContainer.innerHTML = '';
        this.answerTiles.forEach((item, ansIndex) => {
            if (item.char === ' ') {
                const spaceTile = document.createElement('div');
                spaceTile.classList.add('tile', 'space');
                answerContainer.appendChild(spaceTile);
            } else {
                const tile = document.createElement('div');
                tile.classList.add('tile', 'selected');
                tile.textContent = item.char;
                tile.addEventListener('click', () => this.unselectTile(ansIndex));
                answerContainer.appendChild(tile);
            }
        });
    }

    selectTile(index, char) {
        if (!this.gameActive) return;
        
        this.selectedTiles.push(index);
        this.answerTiles.push({ index, char });
        
        const puzzle = this.currentPuzzles[this.currentIndex];
        const scrambled = this.scrambleTitle(puzzle.title);
        this.renderTiles(scrambled);
    }

    unselectTile(ansIndex) {
        if (!this.gameActive) return;
        
        const removed = this.answerTiles.splice(ansIndex, 1)[0];
        const selectedIndex = this.selectedTiles.indexOf(removed.index);
        if (selectedIndex > -1) {
            this.selectedTiles.splice(selectedIndex, 1);
        }
        
        const puzzle = this.currentPuzzles[this.currentIndex];
        const scrambled = this.scrambleTitle(puzzle.title);
        this.renderTiles(scrambled);
    }

    attachEventListeners() {
        const submitBtn = document.getElementById('btn-submit');
        const skipBtn = document.getElementById('btn-skip');
        const clearBtn = document.getElementById('btn-clear');
        const shuffleBtn = document.getElementById('btn-shuffle');
        const hintBtn = document.getElementById('btn-hint');

        if (submitBtn) submitBtn.addEventListener('click', () => this.submitAnswer());
        if (skipBtn) skipBtn.addEventListener('click', () => this.skipPuzzle());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAnswer());
        if (shuffleBtn) shuffleBtn.addEventListener('click', () => this.shuffleTiles());
        if (hintBtn) hintBtn.addEventListener('click', () => this.showHint());
    }

    submitAnswer() {
        if (!this.gameActive || this.answerTiles.length === 0) return;

        const answer = this.answerTiles.map(t => t.char).join('');
        const puzzle = this.currentPuzzles[this.currentIndex];
        const correct = answer.toLowerCase().replace(/[^a-z0-9]/g, '') === 
                       puzzle.title.toLowerCase().replace(/[^a-z0-9]/g, '');

        const feedbackEl = document.getElementById('feedback');
        
        if (correct) {
            this.score++;
            if (feedbackEl) {
                feedbackEl.textContent = '✓ Correct!';
                feedbackEl.className = 'feedback-message correct';
            }
            
            setTimeout(() => {
                this.currentIndex++;
                if (this.currentIndex >= this.currentPuzzles.length) {
                    this.endGame();
                } else {
                    this.loadPuzzle();
                }
            }, 800);
        } else {
            if (feedbackEl) {
                feedbackEl.textContent = '✗ Incorrect - Try again!';
                feedbackEl.className = 'feedback-message incorrect';
            }
            
            setTimeout(() => {
                if (feedbackEl) feedbackEl.textContent = '';
            }, 1500);
        }
    }

    skipPuzzle() {
        if (!this.gameActive) return;

        // Move current puzzle to end
        const puzzle = this.currentPuzzles.splice(this.currentIndex, 1)[0];
        this.currentPuzzles.push(puzzle);
        
        this.loadPuzzle();
    }

    clearAnswer() {
        if (!this.gameActive) return;
        
        this.selectedTiles = [];
        this.answerTiles = [];
        
        const puzzle = this.currentPuzzles[this.currentIndex];
        const scrambled = this.scrambleTitle(puzzle.title);
        this.renderTiles(scrambled);
    }

    shuffleTiles() {
        if (!this.gameActive) return;
        this.render();
    }

    showHint() {
        if (!this.gameActive || this.hintUsed) return;
        
        this.hintUsed = true;
        const hintDisplay = document.getElementById('hint-display');
        const hintBtn = document.getElementById('btn-hint');
        const puzzle = this.currentPuzzles[this.currentIndex];
        
        if (hintDisplay) {
            hintDisplay.textContent = `Published: ${puzzle.year}`;
            hintDisplay.classList.add('visible');
        }
        
        if (hintBtn) {
            hintBtn.disabled = true;
        }
    }

    endGame() {
        this.gameActive = false;
        this.stopTimer();
        this.saveStats(this.score);
        this.showCompletionScreen(this.score);
        
        if (window.confetti && this.score === this.currentPuzzles.length) {
            window.confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    }

    showCompletionScreen(score) {
        const total = this.currentPuzzles.length || 5;
        this.gameContainer.innerHTML = `
            <div class="game-over-screen">
                <h2>Time's Up!</h2>
                <div class="final-score">${score} / ${total}</div>
                <p>You unscrambled ${score} title${score !== 1 ? 's' : ''} correctly!</p>
                <button class="btn btn-newgame" onclick="location.reload()">Play Again Tomorrow</button>
            </div>
        `;
        
        setTimeout(() => this.showStatsModal(), 1500);
    }

    loadStats() {
        const saved = localStorage.getItem('title_scramble_stats');
        if (saved) return JSON.parse(saved);
        return {
            history: {},
            played: 0,
            totalScore: 0,
            bestScore: 0,
            streak: 0,
            lastPlayed: null
        };
    }

    saveStats(score) {
        const today = this.getTodayString();
        
        if (this.stats.history[today]) return;

        this.stats.history[today] = {
            score: score,
            total: this.currentPuzzles.length
        };

        this.stats.played++;
        this.stats.totalScore += score;
        if (score > this.stats.bestScore) {
            this.stats.bestScore = score;
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        if (this.stats.lastPlayed === yesterdayStr) {
            this.stats.streak++;
        } else {
            this.stats.streak = 1;
        }
        this.stats.lastPlayed = today;

        localStorage.setItem('title_scramble_stats', JSON.stringify(this.stats));
    }

    setupStatsModal() {
        const modal = document.getElementById('stats-modal');
        const closeBtn = modal.querySelector('.close-modal');
        const statsBtn = document.getElementById('btn-stats');
        
        if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
        if (statsBtn) statsBtn.onclick = () => this.showStatsModal();
    }

    showStatsModal() {
        const modal = document.getElementById('stats-modal');

        document.getElementById('stat-streak').textContent = this.stats.streak;
        document.getElementById('stat-played').textContent = this.stats.played;

        const avg = this.stats.played > 0 ? (this.stats.totalScore / this.stats.played).toFixed(1) : 0;
        document.getElementById('stat-avg-score').textContent = avg;
        document.getElementById('stat-best').textContent = this.stats.bestScore;

        const historyEl = document.getElementById('stats-history');
        historyEl.innerHTML = '<h3>Recent History</h3>';
        Object.keys(this.stats.history).sort().reverse().slice(0, 5).forEach(date => {
            const entry = this.stats.history[date];
            const div = document.createElement('div');
            div.classList.add('history-item');
            div.innerHTML = `<span>${date}</span><span>${entry.score}/${entry.total}</span>`;
            historyEl.appendChild(div);
        });

        modal.classList.remove('hidden');
    }

    startCountdown() {
        const timerEl = document.getElementById('countdown-timer');
        if (!timerEl) return;
        
        const update = () => {
            const now = new Date();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            const diff = tomorrow - now;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            timerEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };
        update();
        setInterval(update, 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new TitleScramble();
    game.init();
});