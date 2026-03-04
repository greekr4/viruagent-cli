#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../src/utils/parser');
const { run } = require('../src/runner');

const usage = () => `
Usage:
  viruagent-cli <command> [options]

Commands:
  status                  provider 로그인 상태 확인
  auth-status             status와 동일
  login                   로그인 수행
  publish                 글 발행
  save-draft              임시저장
  list-categories         카테고리 목록 조회
  list-posts              최근 글 목록 조회
  read-post               글 상세 조회
  logout                  provider 로그아웃
  list-providers          지원 provider 목록 조회

Common options:
  --provider <name>       tistory 또는 naver (기본: tistory)
  --help, -h              사용법 출력

Examples:
  viruagent-cli publish --title "제목" --content-file ./post.html
  viruagent-cli list-categories --provider tistory
  viruagent-cli login --username 아이디 --password 비밀번호
`;

const printHelp = () => {
  console.log(usage().trim());
};

const main = async () => {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const parsed = parseArgs(args);
  const command = parsed._.shift();
  if (!command) {
    printHelp();
    process.exit(1);
  }

  try {
    await run(command, parsed.flags, parsed._, (output) => {
      process.stdout.write(`${output}\n`);
    });
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(1);
  }
};

main();
