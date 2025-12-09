const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

// 게임 방 저장소
const rooms = new Map();

// 방 코드 생성 (6자리)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket.io 연결 처리
io.on('connection', (socket) => {
  console.log('사용자 연결:', socket.id);

  // 호스트가 방 생성
  socket.on('create-room', (quizData, callback) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      hostId: socket.id,
      quiz: quizData,
      participants: [],
      currentQuestion: -1,
      isStarted: false,
      answers: new Map(),
      scores: new Map()
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    
    console.log(`방 생성됨: ${roomCode}`);
    callback({ success: true, roomCode });
  });

  // 참여자가 방 입장
  socket.on('join-room', ({ roomCode, nickname }, callback) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      callback({ success: false, message: '방을 찾을 수 없습니다!' });
      return;
    }
    
    if (room.isStarted) {
      callback({ success: false, message: '이미 게임이 시작되었습니다!' });
      return;
    }

    const participant = {
      id: socket.id,
      nickname,
      score: 0
    };
    
    room.participants.push(participant);
    room.scores.set(socket.id, 0);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.nickname = nickname;
    
    // 호스트에게 새 참여자 알림
    io.to(room.hostId).emit('participant-joined', {
      participant,
      totalParticipants: room.participants.length
    });
    
    // 참여자에게 성공 응답
    callback({ 
      success: true, 
      quizTitle: room.quiz.title,
      participantCount: room.participants.length 
    });
    
    console.log(`${nickname}님이 방 ${roomCode}에 입장`);
  });

  // 호스트가 게임 시작
  socket.on('start-game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) return;
    
    room.isStarted = true;
    room.currentQuestion = 0;
    
    // 모든 참여자에게 게임 시작 알림
    io.to(roomCode).emit('game-started', {
      totalQuestions: room.quiz.questions.length
    });
    
    // 첫 번째 문제 전송
    sendQuestion(roomCode);
  });

  // 문제 전송
  function sendQuestion(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const questionIndex = room.currentQuestion;
    const question = room.quiz.questions[questionIndex];
    
    if (!question) {
      // 모든 문제 완료 - 결과 발표
      endGame(roomCode);
      return;
    }
    
    // 현재 문제에 대한 답변 초기화
    room.answers.set(questionIndex, new Map());
    
    const questionData = {
      index: questionIndex,
      total: room.quiz.questions.length,
      question: question.question,
      type: question.type,
      options: question.options,
      timeLimit: question.timeLimit || 20
    };
    
    io.to(roomCode).emit('new-question', questionData);
    
    // 타이머 시작
    setTimeout(() => {
      showAnswer(roomCode, questionIndex);
    }, (question.timeLimit || 20) * 1000);
  }

  // 참여자 답변 제출
  socket.on('submit-answer', ({ roomCode, questionIndex, answer, timeRemaining }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.isStarted) return;
    
    const questionAnswers = room.answers.get(questionIndex);
    if (!questionAnswers || questionAnswers.has(socket.id)) return;
    
    questionAnswers.set(socket.id, {
      answer,
      timeRemaining
    });
    
    // 호스트에게 답변 현황 업데이트
    io.to(room.hostId).emit('answer-submitted', {
      answeredCount: questionAnswers.size,
      totalParticipants: room.participants.length
    });
  });

  // 정답 공개 및 점수 계산
  function showAnswer(roomCode, questionIndex) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const question = room.quiz.questions[questionIndex];
    const questionAnswers = room.answers.get(questionIndex);
    
    // 점수 계산
    const results = [];
    room.participants.forEach(p => {
      const playerAnswer = questionAnswers?.get(p.id);
      let isCorrect = false;
      let pointsEarned = 0;
      
      if (playerAnswer) {
        if (question.type === 'slider') {
          // 슬라이더: 정답과의 차이에 따라 점수
          const diff = Math.abs(playerAnswer.answer - question.correctAnswer);
          const maxDiff = question.options.max - question.options.min;
          const accuracy = 1 - (diff / maxDiff);
          pointsEarned = Math.round(accuracy * 1000 * (playerAnswer.timeRemaining / (question.timeLimit || 20)));
          isCorrect = accuracy > 0.9;
        } else {
          // 선택형: 정답 여부
          isCorrect = playerAnswer.answer === question.correctAnswer;
          if (isCorrect) {
            pointsEarned = Math.round(1000 * (playerAnswer.timeRemaining / (question.timeLimit || 20)));
          }
        }
      }
      
      const currentScore = room.scores.get(p.id) || 0;
      room.scores.set(p.id, currentScore + pointsEarned);
      
      results.push({
        id: p.id,
        nickname: p.nickname,
        isCorrect,
        pointsEarned,
        totalScore: currentScore + pointsEarned
      });
    });
    
    // 점수 순으로 정렬
    results.sort((a, b) => b.totalScore - a.totalScore);
    
    io.to(roomCode).emit('show-answer', {
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      results
    });
    
    // 5초 후 다음 문제
    setTimeout(() => {
      room.currentQuestion++;
      sendQuestion(roomCode);
    }, 5000);
  }

  // 게임 종료
  function endGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const finalResults = room.participants.map(p => ({
      nickname: p.nickname,
      score: room.scores.get(p.id) || 0
    })).sort((a, b) => b.score - a.score);
    
    io.to(roomCode).emit('game-ended', { results: finalResults });
  }

  // 연결 해제
  socket.on('disconnect', () => {
    console.log('사용자 연결 해제:', socket.id);
    
    // 참여자가 나간 경우 방에서 제거
    if (socket.roomCode) {
      const room = rooms.get(socket.roomCode);
      if (room) {
        room.participants = room.participants.filter(p => p.id !== socket.id);
        
        // 호스트에게 알림
        io.to(room.hostId).emit('participant-left', {
          nickname: socket.nickname,
          totalParticipants: room.participants.length
        });
      }
    }
    
    // 호스트가 나간 경우 방 삭제
    rooms.forEach((room, code) => {
      if (room.hostId === socket.id) {
        io.to(code).emit('room-closed');
        rooms.delete(code);
        console.log(`방 ${code} 삭제됨 (호스트 퇴장)`);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 레트로 퀴즈 서버가 포트 ${PORT}에서 실행 중!`);
  console.log(`http://localhost:${PORT}`);
});

