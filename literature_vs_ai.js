document.addEventListener('DOMContentLoaded', () => {
    let allQuotes = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let gamesPlayed = 0;
    let currentStreak = 0;
    
    const quoteArea = document.getElementById('quote-area');
    const optionsArea = document.getElementById('options-area');
    const scoreDisplay = document.getElementById('score');
    const questionCountDisplay = document.getElementById('question-count');
    const progressFill = document.getElementById('progress-fill');
    const sourceInfo = document.getElementById('source-info');
    const authorName = document.getElementById('author-name');
    const workTitle = document.getElementById('work-title');
    const btnNext = document.getElementById('btn-next');
    const btnRestart = document.getElementById('btn-restart');
    
    // Navigation Dropdown
    const dropdownToggle = document.getElementById('more-games-btn');
    const dropdownMenu = document.getElementById('more-games-menu');
    
    if (dropdownToggle) {
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });
    }

    document.addEventListener('click', () => {
        if (dropdownMenu && dropdownMenu.classList.contains('show')) {
            dropdownMenu.classList.remove('show');
        }
    });

    // Stats Modal
    const statsModal = document.getElementById('stats-modal');
    const btnStats = document.getElementById('btn-stats');
    const closeModal = document.querySelector('.close-modal');

    if (btnStats) {
        btnStats.addEventListener('click', () => {
            updateStatsDisplay();
            statsModal.classList.remove('hidden');
        });
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => {
            statsModal.classList.add('hidden');
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === statsModal) {
            statsModal.classList.add('hidden');
        }
    });

    // Load Data
    fetch('data/lit_vs_ai.json')
        .then(response => response.json())
        .then(data => {
            allQuotes = shuffleArray(data);
            initGame();
        })
        .catch(err => {
            console.error('Error loading quotes:', err);
            quoteArea.textContent = 'Failed to load quotes. Please try again later.';
        });

    function initGame() {
        currentQuestionIndex = 0;
        score = 0;
        updateUI();
        loadQuestion();
        btnRestart.classList.add('hidden');
    }

    function loadQuestion() {
        const currentQuote = allQuotes[currentQuestionIndex];
        quoteArea.textContent = "Which of these is the real quote?";
        sourceInfo.classList.remove('visible');
        btnNext.classList.add('hidden');
        
        // Prepare options
        const options = [
            { text: currentQuote.original, isCorrect: true },
            ...currentQuote.pastiches.map(p => ({ text: p, isCorrect: false }))
        ];
        
        const shuffledOptions = shuffleArray(options);
        
        optionsArea.innerHTML = '';
        shuffledOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = opt.text;
            btn.addEventListener('click', () => handleSelect(opt, btn));
            optionsArea.appendChild(btn);
        });

        updateProgress();
    }

    function handleSelect(option, btn) {
        const buttons = optionsArea.querySelectorAll('.option-btn');
        buttons.forEach(b => b.disabled = true);

        if (option.isCorrect) {
            btn.classList.add('correct');
            btn.classList.add('pulse');
            score += 100;
            currentStreak++;
            scoreDisplay.textContent = `Points: ${score}`;
        } else {
            btn.classList.add('incorrect');
            btn.classList.add('shake');
            currentStreak = 0;
            // Highlight correct one
            buttons.forEach(b => {
                const optText = b.textContent;
                const currentQuote = allQuotes[currentQuestionIndex];
                if (optText === currentQuote.original) {
                    b.classList.add('correct');
                }
            });
        }

        // Show source
        const currentQuote = allQuotes[currentQuestionIndex];
        authorName.textContent = currentQuote.author;
        workTitle.textContent = currentQuote.work;
        sourceInfo.classList.add('visible');

        if (currentQuestionIndex < allQuotes.length - 1) {
            btnNext.classList.remove('hidden');
        } else {
            endGame();
        }
    }

    function endGame() {
        gamesPlayed++;
        saveStats();
        btnRestart.classList.remove('hidden');
        quoteArea.textContent = `Game Over! Final Score: ${score}`;
    }

    btnNext.addEventListener('click', () => {
        currentQuestionIndex++;
        updateUI();
        loadQuestion();
    });

    btnRestart.addEventListener('click', () => {
        allQuotes = shuffleArray(allQuotes);
        initGame();
    });

    function updateUI() {
        scoreDisplay.textContent = `Points: ${score}`;
        questionCountDisplay.textContent = `Question: ${currentQuestionIndex + 1}/${allQuotes.length}`;
    }

    function updateProgress() {
        const percent = ((currentQuestionIndex) / allQuotes.length) * 100;
        progressFill.style.width = `${percent}%`;
    }

    function shuffleArray(array) {
        const newArr = [...array];
        for (let i = newArr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
        return newArr;
    }

    // Stats Management
    function saveStats() {
        const stats = JSON.parse(localStorage.getItem('lit_vs_ai_stats') || '{"played":0, "bestScore":0, "totalScore":0, "streak":0}');
        stats.played++;
        stats.totalScore += score;
        if (score > stats.bestScore) stats.bestScore = score;
        stats.streak = currentStreak;
        localStorage.setItem('lit_vs_ai_stats', JSON.stringify(stats));
    }

    function updateStatsDisplay() {
        const stats = JSON.parse(localStorage.getItem('lit_vs_ai_stats') || '{"played":0, "bestScore":0, "totalScore":0, "streak":0}');
        document.getElementById('stat-played').textContent = stats.played;
        document.getElementById('stat-best-score').textContent = stats.bestScore;
        document.getElementById('stat-streak').textContent = stats.streak;
        const avg = stats.played > 0 ? Math.round(stats.totalScore / stats.played) : 0;
        document.getElementById('stat-avg-score').textContent = avg;
    }
});
