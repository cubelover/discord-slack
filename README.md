# discord-slack

### 사용법

1. nodejs 설치 (v12.13.1 권장)
1. `npm i`로 패키지 설치
1. `.env` 파일 작성
1. `npm start`로 실행

### .env

* COOKIE
  - 슬랙에 접속하면 쿠키에 `d=~~~`가 있을 텐데, 이 값으로 넣으면 됨
* STOKEN
  - 슬랙에서 개발자 도구를 열면 `token=xoxc-~~~`가 있을 텐데, xoxc부터 넣으면 됨
* SCHANNEL
  - 슬랙에서 중계할 채널. 주소에서 C나 G로 시작하는 9자리 문자열
* SUSER
  - 슬랙을 중계하는 유저. 없어도 문제는 없는 듯
* DTOKEN
  - 디스코드 봇 토큰
* DGUILD
  - 디스코드 길드 번호. 주소에서 앞쪽 18자리 수
* DCHANNEL
  - 디스코드 채널 번호. 주소에서 뒤쪽 18자리 수
