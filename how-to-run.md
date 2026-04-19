npm run dev
/settings에서 Ollama 호스트 설정 및 모델 선택
/studio에서 주제 입력 후 생성
주의: public/fonts/에 Pretendard woff2 파일을 추가해야 한글이 올바르게 렌더링됩니다. Pretendard 릴리즈에서 Pretendard-Regular.woff2, Pretendard-Bold.woff2, Pretendard-SemiBold.woff2를 다운로드하세요.




## 완성된 구조 (cardnews-agent/)

파일	역할
app/studio/page.tsx	메인 UI — 입력→썸네일승인→본문승인→이미지선택→완료 7단계
app/settings/page.tsx	Ollama 연결 설정, 모델 선택
app/api/agent/route.ts	SSE 스트리밍 에이전트 실행
app/api/approve/route.ts	사람 승인 처리 + 세션 상태 저장
app/api/image-upload/route.ts	이미지 업로드 + Sharp 1080px 리사이즈
app/api/render/route.ts	Puppeteer PNG 렌더링 + ZIP
lib/ollama/client.ts	Ollama API 클라이언트
lib/agents/orchestrator.ts	Step 1~4 오케스트레이터 로직
.claude/skills/template-engine/templates/preset-A~C/	HTML 템플릿 9개 (3종 × 3프리셋)