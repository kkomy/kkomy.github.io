# Moonkyeom Kim — Portfolio

사이트: https://kkomy.github.io/

빌드 과정이 없는 정적 사이트입니다. 파일을 고쳐서 `main`에 올리면 그대로 반영됩니다.

## 구조

| 경로 | 내용 |
| --- | --- |
| `index.html`, `css/style.css` | 화면 틀과 스타일 |
| `js/main.js` | 탭(Book / Design / Project) 전환, 작업물 목록·상세 |
| `js/book.js` | 3D 책, 펼치기·넘기기, 빨간 실 물리 |
| `js/pages.js` | 책 본문 조판과 실로 이을 단어 선택 |
| `book/text.txt` | 책 본문 |
| `portfolio.json`, `portfolio/` | 작업물 데이터와 이미지·영상·PDF |
| `vendor/` | three.js |

## 작업물 추가·수정

`portfolio.json`의 `projects` 배열에 항목을 추가합니다.

```json
{
  "section": "design",
  "id": "my-work",
  "title": "제목",
  "category": "Poster Design",
  "year": "2025",
  "description": "설명",
  "image": "./portfolio/my-work.webp",
  "media": "./portfolio/my-work.mp4",
  "link": "https://example.com",
  "gallery": ["./portfolio/my-work-2.webp"]
}
```

- `section`: `design` 또는 `projects` (어느 탭에 보일지)
- `image`: 목록 썸네일 (4:3으로 잘려 보입니다)
- `media`: 선택. `.mp4`는 영상, `.pdf`는 문서로 상세 화면에 표시
- `link`, `gallery`: 선택. 외부 링크 버튼, 상세 화면에 이어서 보일 추가 이미지

이름·소개 문구·이메일은 같은 파일의 `name`, `intro`, `email`에서 바꿉니다.

## 책 본문 바꾸기

`book/text.txt`를 고치면 페이지가 자동으로 다시 나뉩니다.

- `# One — The Hatchery` : 장 제목
- 빈 줄 : 문단 나눔
- `*word*` : 핵심 동사 (실로 이어질 후보)
- 등장인물 이름은 `js/pages.js`의 `CHARACTERS` 목록으로 자동 인식합니다.

한 펼침면에서 왼쪽·오른쪽 페이지에 같은 인물이나 같은 동사가 있으면 먼저 잇고, 남는 자리는 동사끼리 순서대로 잇습니다(펼침면당 최대 6가닥).

## 로컬에서 보기

```bash
python3 -m http.server 4173
```

GitHub Pages 설정: `main` 브랜치의 `/ (root)`. `.nojekyll` 파일은 유지하세요.
