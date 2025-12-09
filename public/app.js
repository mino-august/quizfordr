// Socket.io 연결
const socket = io();

// 상태 관리
let currentRoomCode = null;
let isHost = false;
let currentQuestion = null;
let timerInterval = null;
let timeRemaining = 0;
let hasAnswered = false;
let questionCount = 0;

// 아바타 이모지 목록
const avatars = ['🦊', '🐸', '🐱', '🐶', '🐰', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐵', '🐔', '🦄', '🐲'];

// ===== 화면 전환 =====
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
  
  // 호스트 설정 화면일 때 첫 문제 추가
  if (screenId === 'host-setup' && document.getElementById('questions-container').children.length === 0) {
    addQuestion();
  }
}

// ===== 토스트 알림 =====
function showToast(message, icon = 'ℹ️') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.querySelector('.toast-icon');
  
  toastMessage.textContent = message;
  toastIcon.textContent = icon;
  
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ===== 문제 추가 =====
function addQuestion() {
  const container = document.getElementById('questions-container');
  questionCount++;
  
  const questionCard = document.createElement('div');
  questionCard.className = 'question-card';
  questionCard.dataset.questionIndex = questionCount;
  
  questionCard.innerHTML = `
    <div class="question-header">
      <span class="question-number">문제 ${questionCount}</span>
      <button class="delete-question-btn" onclick="deleteQuestion(this)">✕</button>
    </div>
    
    <input type="text" class="question-input" placeholder="문제를 입력하세요" data-field="question">
    
    <select class="question-type-select" onchange="toggleQuestionType(this)" data-field="type">
      <option value="multiple">객관식 (4지선다)</option>
      <option value="slider">슬라이더 (숫자 맞추기)</option>
    </select>
    
    <div class="options-wrapper" data-type="multiple">
      <div class="options-container">
        <div class="option-input-group">
          <input type="radio" name="correct-${questionCount}" class="option-radio" value="0" checked>
          <input type="text" class="option-input" placeholder="보기 1" data-option="0">
        </div>
        <div class="option-input-group">
          <input type="radio" name="correct-${questionCount}" class="option-radio" value="1">
          <input type="text" class="option-input" placeholder="보기 2" data-option="1">
        </div>
        <div class="option-input-group">
          <input type="radio" name="correct-${questionCount}" class="option-radio" value="2">
          <input type="text" class="option-input" placeholder="보기 3" data-option="2">
        </div>
        <div class="option-input-group">
          <input type="radio" name="correct-${questionCount}" class="option-radio" value="3">
          <input type="text" class="option-input" placeholder="보기 4" data-option="3">
        </div>
      </div>
      <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">✓ 정답인 보기를 선택하세요</p>
    </div>
    
    <div class="options-wrapper slider-options" data-type="slider" style="display: none;">
      <div class="form-group">
        <label class="pixel-label" style="color: #333; text-shadow: none;">최소값</label>
        <input type="number" class="question-input" data-field="min" value="0">
      </div>
      <div class="form-group">
        <label class="pixel-label" style="color: #333; text-shadow: none;">최대값</label>
        <input type="number" class="question-input" data-field="max" value="100">
      </div>
      <div class="form-group">
        <label class="pixel-label" style="color: #333; text-shadow: none;">정답</label>
        <input type="number" class="question-input" data-field="sliderAnswer" value="50">
      </div>
    </div>
    
    <select class="time-select" data-field="timeLimit">
      <option value="10">⏱️ 10초</option>
      <option value="20" selected>⏱️ 20초</option>
      <option value="30">⏱️ 30초</option>
      <option value="60">⏱️ 60초</option>
    </select>
  `;
  
  container.appendChild(questionCard);
  
  // 스크롤 이동
  questionCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== 문제 삭제 =====
function deleteQuestion(btn) {
  const card = btn.closest('.question-card');
  card.remove();
  
  // 문제 번호 다시 매기기
  const cards = document.querySelectorAll('.question-card');
  cards.forEach((card, index) => {
    card.querySelector('.question-number').textContent = `문제 ${index + 1}`;
  });
}

// ===== 문제 유형 토글 =====
function toggleQuestionType(select) {
  const card = select.closest('.question-card');
  const multipleOptions = card.querySelector('[data-type="multiple"]');
  const sliderOptions = card.querySelector('[data-type="slider"]');
  
  if (select.value === 'slider') {
    multipleOptions.style.display = 'none';
    sliderOptions.style.display = 'block';
  } else {
    multipleOptions.style.display = 'block';
    sliderOptions.style.display = 'none';
  }
}

// ===== 퀴즈 데이터 수집 =====
function collectQuizData() {
  const title = document.getElementById('quiz-title').value.trim();
  
  if (!title) {
    showToast('퀴즈 제목을 입력해주세요!', '⚠️');
    return null;
  }
  
  const questionCards = document.querySelectorAll('.question-card');
  
  if (questionCards.length === 0) {
    showToast('최소 1개 이상의 문제를 추가해주세요!', '⚠️');
    return null;
  }
  
  const questions = [];
  
  for (const card of questionCards) {
    const questionText = card.querySelector('[data-field="question"]').value.trim();
    const type = card.querySelector('[data-field="type"]').value;
    const timeLimit = parseInt(card.querySelector('[data-field="timeLimit"]').value);
    
    if (!questionText) {
      showToast('모든 문제를 입력해주세요!', '⚠️');
      return null;
    }
    
    const questionData = {
      question: questionText,
      type,
      timeLimit
    };
    
    if (type === 'multiple') {
      const options = [];
      const optionInputs = card.querySelectorAll('[data-option]');
      
      for (const input of optionInputs) {
        const optionText = input.value.trim();
        if (!optionText) {
          showToast('모든 보기를 입력해주세요!', '⚠️');
          return null;
        }
        options.push(optionText);
      }
      
      questionData.options = options;
      questionData.correctAnswer = parseInt(card.querySelector('.option-radio:checked').value);
    } else {
      const min = parseInt(card.querySelector('[data-field="min"]').value);
      const max = parseInt(card.querySelector('[data-field="max"]').value);
      const answer = parseInt(card.querySelector('[data-field="sliderAnswer"]').value);
      
      questionData.options = { min, max };
      questionData.correctAnswer = answer;
    }
    
    questions.push(questionData);
  }
  
  return { title, questions };
}

// ===== 방 생성 =====
function createRoom() {
  const quizData = collectQuizData();
  
  if (!quizData) return;
  
  const btn = document.getElementById('create-room-btn');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = '생성 중...';
  
  socket.emit('create-room', quizData, (response) => {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = '방 만들기';
    
    if (response.success) {
      currentRoomCode = response.roomCode;
      isHost = true;
      
      document.getElementById('room-code-display').textContent = response.roomCode;
      showScreen('host-lobby');
      showToast('방이 생성되었습니다!', '🎉');
    } else {
      showToast('방 생성에 실패했습니다.', '❌');
    }
  });
}

// ===== 방 참가 =====
function joinRoom() {
  const nickname = document.getElementById('nickname').value.trim();
  const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
  
  if (!nickname) {
    showToast('닉네임을 입력해주세요!', '⚠️');
    return;
  }
  
  if (!roomCode || roomCode.length !== 6) {
    showToast('6자리 참가 코드를 입력해주세요!', '⚠️');
    return;
  }
  
  socket.emit('join-room', { roomCode, nickname }, (response) => {
    if (response.success) {
      currentRoomCode = roomCode;
      isHost = false;
      
      document.getElementById('player-nickname').textContent = nickname;
      document.getElementById('quiz-title-display').textContent = response.quizTitle;
      document.getElementById('player-count-display').textContent = response.participantCount;
      
      showScreen('player-lobby');
      showToast(`${response.quizTitle}에 참가했습니다!`, '🎮');
    } else {
      showToast(response.message, '❌');
    }
  });
}

// ===== 게임 시작 (호스트) =====
function startGame() {
  if (!currentRoomCode || !isHost) return;
  
  socket.emit('start-game', currentRoomCode);
}

// ===== 답변 제출 =====
function submitAnswer(answerIndex) {
  if (hasAnswered || !currentQuestion) return;
  
  hasAnswered = true;
  
  // 선택한 버튼 표시
  const buttons = document.querySelectorAll('.answer-btn');
  buttons.forEach((btn, index) => {
    if (index === answerIndex) {
      btn.classList.add('selected');
    }
    btn.disabled = true;
  });
  
  socket.emit('submit-answer', {
    roomCode: currentRoomCode,
    questionIndex: currentQuestion.index,
    answer: answerIndex,
    timeRemaining
  });
  
  showToast('답변이 제출되었습니다!', '✅');
}

// ===== 슬라이더 답변 제출 =====
function submitSliderAnswer() {
  if (hasAnswered || !currentQuestion) return;
  
  hasAnswered = true;
  
  const slider = document.querySelector('.slider-input');
  const value = parseInt(slider.value);
  
  document.querySelector('.submit-slider-btn').disabled = true;
  
  socket.emit('submit-answer', {
    roomCode: currentRoomCode,
    questionIndex: currentQuestion.index,
    answer: value,
    timeRemaining
  });
  
  showToast('답변이 제출되었습니다!', '✅');
}

// ===== 타이머 시작 =====
function startTimer(duration) {
  timeRemaining = duration;
  
  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');
  
  timerBar.style.width = '100%';
  timerText.textContent = duration;
  
  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    timeRemaining--;
    
    const percentage = (timeRemaining / duration) * 100;
    timerBar.style.width = `${percentage}%`;
    timerText.textContent = timeRemaining;
    
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
}

// ===== 문제 표시 =====
function displayQuestion(questionData) {
  currentQuestion = questionData;
  hasAnswered = false;
  
  document.getElementById('current-q').textContent = questionData.index + 1;
  document.getElementById('total-q').textContent = questionData.total;
  document.getElementById('question-text').textContent = questionData.question;
  
  const answersContainer = document.getElementById('answers-container');
  answersContainer.innerHTML = '';
  
  if (questionData.type === 'multiple') {
    questionData.options.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = option;
      btn.onclick = () => submitAnswer(index);
      answersContainer.appendChild(btn);
    });
  } else {
    // 슬라이더 타입
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';
    sliderContainer.innerHTML = `
      <div class="slider-value" id="slider-value">${Math.round((questionData.options.min + questionData.options.max) / 2)}</div>
      <input type="range" class="slider-input" 
        min="${questionData.options.min}" 
        max="${questionData.options.max}" 
        value="${Math.round((questionData.options.min + questionData.options.max) / 2)}"
        oninput="document.getElementById('slider-value').textContent = this.value">
      <div class="slider-labels">
        <span>${questionData.options.min}</span>
        <span>${questionData.options.max}</span>
      </div>
      <button class="submit-slider-btn retro-btn" onclick="submitSliderAnswer()">제출하기</button>
    `;
    answersContainer.appendChild(sliderContainer);
  }
  
  // 답변 현황 초기화
  document.getElementById('answered-count').textContent = '0';
  
  showScreen('game-screen');
  startTimer(questionData.timeLimit);
}

// ===== 정답 표시 =====
function displayAnswer(data) {
  if (timerInterval) clearInterval(timerInterval);
  
  const title = document.getElementById('answer-result-title');
  const correctAnswerEl = document.getElementById('correct-answer');
  
  // 현재 사용자의 결과 찾기
  const myResult = data.results.find(r => r.id === socket.id);
  
  if (isHost) {
    title.textContent = '정답 공개!';
    title.className = 'answer-title';
  } else if (myResult) {
    if (myResult.isCorrect) {
      title.textContent = '정답! 🎉';
      title.className = 'answer-title correct';
    } else {
      title.textContent = '오답... 😢';
      title.className = 'answer-title incorrect';
    }
  }
  
  // 정답 표시
  if (currentQuestion.type === 'multiple') {
    correctAnswerEl.textContent = currentQuestion.options[data.correctAnswer];
  } else {
    correctAnswerEl.textContent = data.correctAnswer;
  }
  
  // 순위표 표시
  const leaderboard = document.getElementById('leaderboard-mini');
  leaderboard.innerHTML = data.results.slice(0, 5).map((result, index) => `
    <div class="leaderboard-item">
      <span class="leaderboard-rank">${index + 1}.</span>
      <span class="leaderboard-name">${result.nickname}</span>
      <span class="leaderboard-score">${result.totalScore}점</span>
      ${result.pointsEarned > 0 ? `<span class="leaderboard-points">+${result.pointsEarned}</span>` : ''}
    </div>
  `).join('');
  
  showScreen('answer-screen');
}

// ===== 최종 결과 표시 =====
function displayFinalResults(data) {
  const results = data.results;
  
  // 시상대 표시
  const places = ['place-1', 'place-2', 'place-3'];
  const podiumOrder = [1, 0, 2]; // 2등, 1등, 3등 순서
  
  places.forEach((placeId, displayIndex) => {
    const place = document.getElementById(placeId);
    const resultIndex = podiumOrder[displayIndex];
    
    if (results[resultIndex]) {
      place.querySelector('.player-name').textContent = results[resultIndex].nickname;
      place.querySelector('.player-score').textContent = `${results[resultIndex].score}점`;
      place.style.display = 'flex';
    } else {
      place.style.display = 'none';
    }
  });
  
  // 전체 순위 표시
  const fullResults = document.getElementById('full-results');
  fullResults.innerHTML = results.slice(3).map((result, index) => `
    <div class="result-item">
      <span class="result-rank">${index + 4}.</span>
      <span class="result-name">${result.nickname}</span>
      <span class="result-score">${result.score}점</span>
    </div>
  `).join('');
  
  showScreen('results-screen');
}

// ===== Socket.io 이벤트 =====

// 새 참여자 입장 (호스트)
socket.on('participant-joined', (data) => {
  const list = document.getElementById('participants-list');
  const waitingText = list.querySelector('.waiting-text');
  if (waitingText) waitingText.remove();
  
  const avatar = avatars[Math.floor(Math.random() * avatars.length)];
  
  const item = document.createElement('div');
  item.className = 'participant-item';
  item.dataset.id = data.participant.id;
  item.innerHTML = `
    <span class="participant-avatar">${avatar}</span>
    <span class="participant-name">${data.participant.nickname}</span>
  `;
  list.appendChild(item);
  
  document.getElementById('participant-count').textContent = data.totalParticipants;
  
  // 게임 시작 버튼 활성화
  document.getElementById('start-game-btn').disabled = false;
  
  showToast(`${data.participant.nickname}님이 입장했습니다!`, '🍄');
});

// 참여자 퇴장 (호스트)
socket.on('participant-left', (data) => {
  document.getElementById('participant-count').textContent = data.totalParticipants;
  
  // 리스트에서 제거 (필요시)
  showToast(`${data.nickname}님이 퇴장했습니다.`, '👋');
  
  // 참여자가 없으면 시작 버튼 비활성화
  if (data.totalParticipants === 0) {
    document.getElementById('start-game-btn').disabled = true;
  }
});

// 게임 시작
socket.on('game-started', (data) => {
  document.getElementById('total-players').textContent = data.totalParticipants || 0;
  showToast('게임이 시작됩니다!', '🎮');
});

// 새 문제
socket.on('new-question', (questionData) => {
  displayQuestion(questionData);
});

// 답변 현황 업데이트 (호스트)
socket.on('answer-submitted', (data) => {
  document.getElementById('answered-count').textContent = data.answeredCount;
  document.getElementById('total-players').textContent = data.totalParticipants;
});

// 정답 공개
socket.on('show-answer', (data) => {
  displayAnswer(data);
});

// 게임 종료
socket.on('game-ended', (data) => {
  displayFinalResults(data);
});

// 방 닫힘
socket.on('room-closed', () => {
  showToast('호스트가 방을 나갔습니다.', '❌');
  setTimeout(() => {
    location.reload();
  }, 2000);
});

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  // 코드 입력 자동 대문자
  const codeInput = document.getElementById('room-code-input');
  if (codeInput) {
    codeInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }
  
  // 엔터 키로 입장
  document.getElementById('nickname')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('room-code-input').focus();
    }
  });
  
  document.getElementById('room-code-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinRoom();
    }
  });
  
  console.log('🎮 슈퍼 퀴즈 브라더스 로딩 완료!');
});

