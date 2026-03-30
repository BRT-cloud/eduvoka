// Google Apps Script 연동 URL (구글 시트 동기화용)
const GAS_URL = "https://script.google.com/macros/s/AKfycbw86LpPixVvU1rC6rGQ9FygQ2N41AOmkJj-yugt_wRK5NbxRkF3ydyQHexadzbVWPw7/exec";

/* 앱 전역 상태 세팅 */
let currentUser = null;
let currentMode = null; // 'daily', 'category', 'review'
let targetWords = [];
let activeQueue = [];
let currentLearnWord = null;
let isFlipped = false;

// 유저별 상태
let incorrectWords = [];
let masteredWords = [];
let userScore = 0;

/* 주요 DOM 요소 캐싱 */
const elements = {
    progressBar: document.getElementById('progress-bar'),
    wordCard: document.getElementById('word-card'),
    cardEn: document.getElementById('card-en'),
    cardKo: document.getElementById('card-ko'),
    btnSound: document.getElementById('btn-sound'),
    btnKnow: document.getElementById('btn-know'),
    btnDontKnow: document.getElementById('btn-dont-know'),
    navBtns: document.querySelectorAll('.nav-btn'),
    sections: document.querySelectorAll('.view-section'),
    wordList: document.getElementById('word-list'),
    reviewCount: document.getElementById('review-count'),
    categoryList: document.getElementById('category-list')
};

/* ====== 기기 로그인/로그아웃 로직 ====== */
document.getElementById('btn-login').addEventListener('click', async () => {
    const input = document.getElementById('login-input').value.trim();
    if (!input) { alert("이름을 입력해주세요!"); return; }

    document.getElementById('btn-login').style.display = 'none';
    document.getElementById('login-loading').classList.remove('hidden');
    currentUser = input;

    try {
        if (GAS_URL === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL") {
            // 로컬 모드
            incorrectWords = JSON.parse(localStorage.getItem(`eduvoca_${currentUser}_incorrect`)) || [];
            masteredWords = JSON.parse(localStorage.getItem(`eduvoca_${currentUser}_mastered`)) || [];
            userScore = parseInt(localStorage.getItem(`eduvoca_${currentUser}_score`)) || 0;
            await new Promise(r => setTimeout(r, 600)); // 로딩 시뮬레이션
        } else {
            // 구글 시트 연동 모드
            const res = await fetch(`${GAS_URL}?username=${encodeURIComponent(currentUser)}`);
            const json = await res.json();
            if (json.success && json.data) {
                incorrectWords = JSON.parse(json.data.incorrectWords || '[]');
                masteredWords = JSON.parse(json.data.masteredWords || '[]');
                userScore = json.data.score || 0;
            } else {
                incorrectWords = []; masteredWords = []; userScore = 0;
            }
        }

        document.getElementById('user-name-display').innerText = `${currentUser}님`;
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.remove('hidden');
        switchView('view-home');

    } catch (err) {
        // Fetch 실패 시 로컬 스토리지 데이터로 임시 구동
        incorrectWords = JSON.parse(localStorage.getItem(`eduvoca_${currentUser}_incorrect`)) || [];
        masteredWords = JSON.parse(localStorage.getItem(`eduvoca_${currentUser}_mastered`)) || [];
        userScore = parseInt(localStorage.getItem(`eduvoca_${currentUser}_score`)) || 0;

        document.getElementById('user-name-display').innerText = `${currentUser}(오프라인)`;
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.remove('hidden');
        switchView('view-home');
    } finally {
        document.getElementById('btn-login').style.display = 'block';
        document.getElementById('login-loading').classList.add('hidden');
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    targetWords = []; activeQueue = [];
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('login-input').value = '';
    switchView('view-login');
});

// 데이터 동기화 (로컬 & 클라우드)
async function syncData() {
    if (!currentUser) return;
    localStorage.setItem(`eduvoca_${currentUser}_incorrect`, JSON.stringify(incorrectWords));
    localStorage.setItem(`eduvoca_${currentUser}_mastered`, JSON.stringify(masteredWords));
    localStorage.setItem(`eduvoca_${currentUser}_score`, userScore);

    if (GAS_URL !== "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL") {
        fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                username: currentUser,
                score: userScore,
                masteredWords: masteredWords,
                incorrectWords: incorrectWords
            })
        }).catch(e => console.error("Sync Error", e));
    }
}

/* TTS 설정 (Web Speech API) */
function speakWord(word) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
    }
}

/* 상단 진행도 Bar 및 텍스트 업데이트 */
function updateProgress() {
    if (targetWords.length === 0) return;
    const total = targetWords.length;
    const sessionMastered = total - activeQueue.length - (currentLearnWord ? 1 : 0);
    elements.progressBar.style.width = `${(sessionMastered / total) * 100}%`;
}

/* =========================================================
   [1] 홈 모드 (모드 선택화면 렌더링)
========================================================== */
function renderHome() {
    // 오답노트 개수 업데이트 및 누적 성취 표시
    elements.reviewCount.innerText = `몰랐던 단어 다시 보기 (${incorrectWords.length}개)`;

    // 마스터 표시 (만약 HTML 헤더 쪽에 요약 뷰가 없다면 이곳에 동적으로 정보 추가 가능)
    let homeTitle = document.querySelector('.home-header p');
    if (homeTitle) {
        homeTitle.innerHTML = `현재 <strong>${masteredWords.length} / 500</strong> 단어를 마스터했습니다!<br>더 높은 단계를 위해 도전하세요.`;
    }

    // 500 데이터 중 카테고리 추출 후 동적 렌더링
    const categories = [...new Set(wordsData.map(w => w.category))];
    elements.categoryList.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('div');
        btn.className = 'category-btn';
        btn.innerText = cat;
        btn.onclick = () => startCategory(cat);
        elements.categoryList.appendChild(btn);
    });
}

function switchView(targetId) {
    // 섹션 뷰 전환
    elements.sections.forEach(sec => sec.classList.add('hidden'));
    document.getElementById(targetId).classList.remove('hidden');

    // 네비게이션 버튼 전환 (액티브 상태)
    elements.navBtns.forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-target="${targetId}"]`).classList.add('active');

    // 각 뷰 진입 시 렌더링 갱신
    if (targetId === 'view-home') renderHome();
    if (targetId === 'view-list') renderList();
    if (targetId === 'view-game') initGame();
}

/* 기능 1: 데일리 랜덤 모드 */
function startDaily() {
    currentMode = 'daily';
    // 500개 중 랜덤 20개 픽업
    const shuffled = [...wordsData].sort(() => 0.5 - Math.random());
    targetWords = shuffled.slice(0, 20);
    activeQueue = [...targetWords];

    switchView('view-learn');
    nextLearnWord();
}

/* 기능 2: 카테고리 모드 */
function startCategory(cat) {
    currentMode = 'category';
    targetWords = wordsData.filter(w => w.category === cat);
    activeQueue = [...targetWords];

    switchView('view-learn');
    nextLearnWord();
}

/* 기능 3: 오답노트 복습 모드 */
function startReview() {
    currentMode = 'review';
    targetWords = wordsData.filter(w => incorrectWords.includes(w.id));

    if (targetWords.length === 0) {
        alert("복습할 오답이 없습니다! 아주 완벽해요! 🎉");
        return;
    }

    activeQueue = [...targetWords];
    switchView('view-learn');
    nextLearnWord();
}

/* =========================================================
   [2] 학습 모드 (단어 뷰어 및 플립 카드)
========================================================== */
function nextLearnWord() {
    if (activeQueue.length === 0) {
        currentLearnWord = null;
        updateProgress();
        setTimeout(() => {
            alert(`학습이 모두 완료되었습니다! 💯\n[${currentMode}] 모드 마스터!`);
            currentMode = null;
            switchView('view-home');
        }, 300);
        return;
    }

    // 큐에서 단어 꺼내기
    currentLearnWord = activeQueue.shift();
    isFlipped = false;
    elements.wordCard.classList.remove('flipped');

    setTimeout(() => {
        elements.cardEn.innerText = currentLearnWord.en;
        elements.cardKo.innerText = currentLearnWord.ko;
        updateProgress();
    }, 200);
}

// 카드 클릭 (플립 동작)
elements.wordCard.addEventListener('click', (e) => {
    if (e.target === elements.btnSound || e.target.closest('#btn-sound')) return;
    isFlipped = !isFlipped;
    elements.wordCard.classList.toggle('flipped');
});

// 발음 재생
elements.btnSound.addEventListener('click', () => {
    if (currentLearnWord) speakWord(currentLearnWord.en);
});

// '알아요' 버튼 (오답노트 제거 및 진행)
elements.btnKnow.addEventListener('click', () => {
    if (!currentLearnWord) return;

    // 오답노트에 있다면 제거
    incorrectWords = incorrectWords.filter(id => id !== currentLearnWord.id);

    if (!masteredWords.includes(currentLearnWord.id)) {
        masteredWords.push(currentLearnWord.id);
    }

    syncData();

    // 큐에 넣지 않음 = 학습 성공
    nextLearnWord();
});

// '몰라요' 버튼 (오답노트 추가 및 큐 삽입)
elements.btnDontKnow.addEventListener('click', () => {
    if (!currentLearnWord) return;

    // 오답노트에 방금 틀린 단어 추가
    if (!incorrectWords.includes(currentLearnWord.id)) {
        incorrectWords.push(currentLearnWord.id);
        syncData();
    }

    // 외울 때까지 해야 하므로 큐의 맨 뒤에 재삽입 (Active Queue Method)
    activeQueue.push(currentLearnWord);

    nextLearnWord();
});

/* 하단 네비게이션 이벤트 연결 */
elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        // 학습 모드로 들어가려는데 진행 중인 세션이 없다면 방어
        if (target === 'view-learn' && targetWords.length === 0) {
            alert("홈 화면에서 먼저 학습 진행 모드를 선택해주세요! 🏠");
            return;
        }
        switchView(target);
    });
});

/* =========================================================
   [3] 스피드 단어 매치 게임 로직
========================================================== */
const gameContainer = document.getElementById('game-container');
let gameScore = 0;
let gameLives = 3;
let gameTimer = 10;
let gameInterval = null;
let currentGameWord = null;

function initGame() {
    clearInterval(gameInterval);
    gameContainer.innerHTML = `
        <div class="game-over-container">
            <h2>스피드 단어 매치 🎮</h2>
            <p style="margin-top:15px; color:#64748B; font-size:1.1rem; line-height:1.6;">
                제한 시간 10초 이내에 영단어의 뜻을 맞추세요!<br>
                목숨은 3개 주어집니다.
            </p>
            <button class="btn btn-primary" style="margin-top:40px; padding: 20px 40px; font-size:1.2rem;" onclick="startGame()">게임 시작</button>
        </div>
    `;
}

function startGame() {
    gameScore = 0;
    gameLives = 3;
    nextGameTurn();
}

function nextGameTurn() {
    clearInterval(gameInterval);
    if (gameLives <= 0) {
        endGame();
        return;
    }

    gameTimer = 10;

    // 무작위로 타겟 단어 1개와 오답 3개 픽업
    let shuffledWords = [...wordsData].sort(() => 0.5 - Math.random());
    currentGameWord = shuffledWords[0];

    let options = shuffledWords.slice(1, 4).map(w => w.ko);
    options.push(currentGameWord.ko);
    options.sort(() => 0.5 - Math.random()); // 보기 섞기

    renderGameTurn(currentGameWord, options);

    // TTS 자동 재생 (사용자 편의)
    speakWord(currentGameWord.en);

    // 타이머 인터벌 시작
    let timerBar = document.getElementById('game-timer-bar');
    gameInterval = setInterval(() => {
        gameTimer -= 0.1;
        if (timerBar) {
            timerBar.style.width = `${(gameTimer / 10) * 100}%`;
        }

        if (gameTimer <= 0) {
            clearInterval(gameInterval);
            handleWrongAnswer(null); // 시간 초과
        }
    }, 100);
}

function renderGameTurn(word, options) {
    let hearts = '❤️'.repeat(gameLives) + '🤍'.repeat(3 - gameLives);

    let html = `
        <div class="game-header">
            <div class="game-score-box">SCORE: ${gameScore}</div>
            <div class="game-lives-box">${hearts}</div>
        </div>
        <div class="game-timer-container">
            <div id="game-timer-bar" class="game-timer-bar"></div>
        </div>
        <div class="game-question">
            <h2>${word.en}</h2>
            <button class="icon-btn" onclick="speakWord('${word.en.replace(/'/g, "\\'")}')" aria-label="발음 듣기" style="margin-top:10px; font-size:2rem;">🔊</button>
        </div>
        <div class="game-options">
    `;

    options.forEach(opt => {
        html += `<div class="game-option" data-val="${opt}">${opt}</div>`;
    });

    html += `</div>`;
    gameContainer.innerHTML = html;

    document.querySelectorAll('.game-option').forEach(el => {
        el.addEventListener('click', (e) => {
            checkGameAnswer(e.target);
        });
    });
}

function checkGameAnswer(targetElement) {
    if (targetElement.classList.contains('correct') || targetElement.classList.contains('wrong')) return;
    clearInterval(gameInterval); // 타이머 중지

    const selectedVal = targetElement.dataset.val;
    if (selectedVal === currentGameWord.ko) {
        // 정답 시
        gameScore += 10;
        if (gameScore > userScore) {
            userScore = gameScore;
            syncData(); // 하이스코어 갱신
        }

        targetElement.classList.add('correct');
        setTimeout(nextGameTurn, 600); // 짧은 딜레이 후 다음 문제
    } else {
        // 오답 시
        handleWrongAnswer(targetElement);
    }
}

function handleWrongAnswer(targetElement) {
    gameLives--;

    // 화면 흔들림 효과
    gameContainer.classList.add('shake');
    setTimeout(() => { gameContainer.classList.remove('shake'); }, 400);

    if (targetElement) {
        targetElement.classList.add('wrong');
    }

    // 정답 표시
    document.querySelectorAll('.game-option').forEach(el => {
        if (el.dataset.val === currentGameWord.ko) {
            el.classList.add('correct');
        }
    });

    setTimeout(nextGameTurn, 1000); // 1초 후 다음 문제
}

function endGame() {
    clearInterval(gameInterval);
    gameContainer.innerHTML = `
        <div class="game-over-container">
            <h2>Game Over 💀</h2>
            <div class="game-over-score">Score: ${gameScore}</div>
            <p>수고하셨습니다! 단어 실력을 조금 더 키워보세요.</p>
            <button class="btn btn-primary" style="margin-top:30px; padding:15px 30px;" onclick="startGame()">다시 도전하기</button>
        </div>
    `;
}

/* =========================================================
   [4] 500단어 사전 모드 (리스트 뷰)
========================================================== */
function renderList() {
    elements.wordList.innerHTML = '';

    // 전체 단어 렌더링. 오답 단어는 붉게 표시됨. 성능을 위해 프래그먼트 사용
    const fragment = document.createDocumentFragment();

    wordsData.forEach(w => {
        const isIncorrect = incorrectWords.includes(w.id);
        const li = document.createElement('li');
        li.className = `word-item ${isIncorrect ? 'incorrect' : ''}`;

        li.innerHTML = `
            <div>
                <span class="item-en">${w.en}</span>
                <span class="item-ko"> - ${w.ko}</span>
                <span style="font-size:0.8rem; color:#A0AEC0; margin-left:8px;">[${w.category}]</span>
            </div>
            ${isIncorrect ? '<span class="item-status" style="color:#E74C3C;">📝 오답</span>' : ''}
        `;
        fragment.appendChild(li);
    });

    elements.wordList.appendChild(fragment);
}

/* 실행 시 진입점: 앱 처음 실행 시 홈 렌더링 대신 로그인 뷰를 유지 */
// 로그인 화면이 보이므로, 아무 추가 동작 없이 사용자의 입력을 기다림
