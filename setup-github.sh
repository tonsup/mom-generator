#!/usr/bin/env zsh
# ──────────────────────────────────────────────────────────
# MOM Generator — GitHub Setup Script
# รันครั้งเดียวเพื่อ: สร้าง repo + push code + แนะนำ Vercel
# ──────────────────────────────────────────────────────────

set -e

REPO_NAME="mom-generator"
GITHUB_USER="tonsup"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MOM Generator — GitHub Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "ต้องการ GitHub Personal Access Token (scopes: repo)"
echo "สร้างที่: https://github.com/settings/tokens/new"
echo ""
echo -n "วาง Token ที่นี่: "
read -s GITHUB_TOKEN
echo ""

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "❌ ไม่ได้ใส่ token"
  exit 1
fi

# ── 1. สร้าง repo บน GitHub ────────────────────────────────
echo "⏳ สร้าง GitHub repo: $GITHUB_USER/$REPO_NAME ..."

HTTP_STATUS=$(curl -s -o /tmp/gh_create_response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"private\":false,\"description\":\"Auto Minutes of Meeting — Whisper + GPT-4o, Thai & English\"}")

if [[ "$HTTP_STATUS" == "201" ]]; then
  echo "✅ สร้าง repo สำเร็จ"
elif [[ "$HTTP_STATUS" == "422" ]]; then
  echo "⚠️  Repo นี้มีอยู่แล้ว — ดำเนินการต่อ"
else
  echo "❌ สร้าง repo ไม่สำเร็จ (HTTP $HTTP_STATUS)"
  cat /tmp/gh_create_response.json
  exit 1
fi

# ── 2. Set remote & push ───────────────────────────────────
REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "⏳ กำลัง push ไป GitHub..."
git push -u origin main

# ── 3. Clean up token from remote URL (security) ──────────
git remote set-url origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Push สำเร็จ!"
echo ""
echo "📦 GitHub repo:"
echo "   https://github.com/${GITHUB_USER}/${REPO_NAME}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 ขั้นตอนต่อไป — Deploy บน Vercel (ฟรี):"
echo ""
echo "  1. ไปที่  https://vercel.com/new"
echo "  2. Import repo: ${GITHUB_USER}/${REPO_NAME}"
echo "  3. เพิ่ม Environment Variable:"
echo "       OPENAI_API_KEY = sk-...ใส่ key ที่ได้จาก platform.openai.com/api-keys..."
echo "  4. กด Deploy 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
