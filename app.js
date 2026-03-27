/* 앱 전역 상태 세팅 */
let currentMode = null; // 'daily', 'category', 'review'
let targetWords = [];
let activeQueue = [];
let currentLearnWord = null;
let isFlipped = false;

// 로컬스토리지에서 오답노트 불러오기 (id 배열)
let incorrectWords = JSON.parse(localStorage.getItem('eduvoca_incorrect')) || [];

/* 주요 DOM 요소 캐싱 */
const elements = {
    progressText: document.getElementById('progress-text'),
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
    quizContainer: document.getElementById('quiz-container'),
    reviewCount: document.getElementById('review-count'),
    categoryList: document.getElementById('category-list')
};

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
    // 큐 및 현재 표시된 단어를 제외한 것이 학습 완료(mastered) 통계
    const mastered = total - activeQueue.length - (currentLearnWord ? 1 : 0);
    
    elements.progressText.innerText = `${mastered} / ${total}`;
    elements.progressBar.style.width = `${(mastered / total) * 100}%`;
}

function saveIncorrect() {
    localStorage.setItem('eduvoca_incorrect', JSON.stringify(incorrectWords));
}

/* =========================================================
   [1] 홈 모드 (모드 선택화면 렌더링)
========================================================== */
function renderHome() {
    // 오답노트 개수 업데이트
    elements.reviewCount.innerText = `몰랐던 단어 다시 보기 (${incorrectWords.length}개)`;
    
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
    if (targetId === 'view-quiz') initQuiz();
}

/* 기능 1: 데일리 랜덤 모드 */
function startDaily() {
    currentMode = 'daily';
    // 500개 중 랜덤 50개 픽업
    const shuffled = [...wordsData].sort(() => 0.5 - Math.random());
    targetWords = shuffled.slice(0, 50);
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
    saveIncorrect();
    
    // 큐에 넣지 않음 = 학습 성공
    nextLearnWord();
});

// '몰라요' 버튼 (오답노트 추가 및 큐 삽입)
elements.btnDontKnow.addEventListener('click', () => {
    if (!currentLearnWord) return;
    
    // 오답노트에 방금 틀린 단어 추가
    if (!incorrectWords.includes(currentLearnWord.id)) {
        incorrectWords.push(currentLearnWord.id);
        saveIncorrect();
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
   [3] 퀴즈 모드
========================================================== */
let quizQuestions = [];
let currentQuizIndex = 0;
let quizScore = 0;

function initQuiz() {
    quizScore = 0;
    currentQuizIndex = 0;
    
    // 전체 500개 데이터 중 무작위로 10문제 추출!
    let shuffledWords = [...wordsData].sort(() => 0.5 - Math.random());
    let selectedWords = shuffledWords.slice(0, 10);
    
    quizQuestions = selectedWords.map((word, index) => {
        const isSubjective = index % 3 === 0; 
        
        if (isSubjective) {
            return {
                type: 'subjective',
                word: word,
                question: `뜻이 '${word.ko}'인 영단어는?`,
                answer: word.en
            };
        } else {
            let options = [...wordsData]
                            .filter(w => w.en !== word.en)
                            .sort(() => 0.5 - Math.random())
                            .slice(0, 3);
            options.push(word);
            options.sort(() => 0.5 - Math.random()); 
            
            return {
                type: 'objective',
                word: word,
                question: `'${word.en}'의 올바른 뜻은?`,
                options: options.map(o => o.ko),
                answer: word.ko
            };
        }
    });

    renderQuizQuestion();
}

function renderQuizQuestion() {
    elements.quizContainer.innerHTML = '';
    
    if (currentQuizIndex >= quizQuestions.length) {
        renderQuizResult();
        return;
    }
    
    let q = quizQuestions[currentQuizIndex];
    let html = `<div class="quiz-status">문제 ${currentQuizIndex + 1} / ${quizQuestions.length}</div>`;
    html += `<div class="quiz-question">${q.question}</div>`;
    
    if (q.type === 'objective') {
        q.options.forEach(opt => {
            html += `<div class="quiz-option" data-val="${opt}">${opt}</div>`;
        });
        elements.quizContainer.innerHTML = html;
        
        document.querySelectorAll('.quiz-option').forEach(el => {
            el.addEventListener('click', (e) => {
                const val = e.target.dataset.val;
                checkQuizAnswer(val, q.answer, el);
            });
        });
    } else {
        html += `<input type="text" id="quiz-input" class="quiz-input" placeholder="스펠링을 입력하세요" autocomplete="off" />`;
        html += `<button id="quiz-submit" class="btn btn-primary" style="padding: 18px;">확인</button>`;
        elements.quizContainer.innerHTML = html;
        
        const submitBtn = document.getElementById('quiz-submit');
        const inputEl = document.getElementById('quiz-input');
        
        submitBtn.addEventListener('click', () => {
             checkQuizAnswer(inputEl.value.trim().toLowerCase(), q.answer, inputEl);
        });
        
        inputEl.addEventListener('keypress', (e) => {
             if(e.key === 'Enter') {
                checkQuizAnswer(inputEl.value.trim().toLowerCase(), q.answer, inputEl);
             }
        });
    }
}

function checkQuizAnswer(userAnswer, correctAnswer, targetElement) {
    if(targetElement.classList.contains('correct') || targetElement.classList.contains('wrong')) return;

    let isCorrect = (userAnswer === correctAnswer);
    
    if (isCorrect) {
        quizScore++;
        targetElement.classList.add('correct');
    } else {
        targetElement.classList.add('wrong');
        
        if (targetElement.classList.contains('quiz-option')) {
            document.querySelectorAll('.quiz-option').forEach(el => {
               if(el.dataset.val === correctAnswer) el.classList.add('correct');
            });
        } else {
            targetElement.value = `정답: ${correctAnswer}`;
            targetElement.disabled = true;
        }
    }
    
    setTimeout(() => {
        currentQuizIndex++;
        renderQuizQuestion();
    }, 1200);
}

function renderQuizResult() {
    elements.quizContainer.innerHTML = `
        <div class="quiz-result-container">
            <h2>퀴즈 완료! 🎉</h2>
            <div class="quiz-score">${quizScore} / ${quizQuestions.length}</div>
            <p>참 잘했어요! 더 다양한 단어로 퀴즈에 도전하세요.</p>
            <button class="btn btn-primary" style="margin-top:25px;" onclick="initQuiz()">새 랜덤 퀴즈 시작</button>
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

/* 실행 시 진입점: 앱 처음 실행 시 홈 렌더링 */
renderHome();
