#!/bin/bash
# framework-skills-install.sh
# AI開発フレームワークのスキルを既存プロジェクトに適用するスクリプト

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# フレームワークのルートディレクトリ
FRAMEWORK_ROOT="${FRAMEWORK_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SKILLS_SOURCE="$FRAMEWORK_ROOT/.claude/skills"
FRAMEWORK_GUIDE="$FRAMEWORK_ROOT/templates/project/FRAMEWORK_GUIDE.md"

# 使い方
usage() {
    echo "使い方: $0 [オプション] <対象プロジェクトパス>"
    echo ""
    echo "オプション:"
    echo "  -a, --all          全スキルをインストール"
    echo "  -p, --phase <name> 特定フェーズのみ (discovery|business|product|technical|implementation|review-council)"
    echo "  -t, --teams        Agent Teamsパターンのみ"
    echo "  -d, --deliberation 合議制プロトコルのみ"
    echo "  -u, --update       既存スキルを上書き更新"
    echo "  -n, --dry-run      実行せずに確認のみ"
    echo "  -h, --help         このヘルプを表示"
    echo ""
    echo "例:"
    echo "  $0 -a /path/to/my-project"
    echo "  $0 -p discovery -p product /path/to/my-project"
    echo "  $0 -t -d /path/to/my-project"
}

# ログ関数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# スキルのコピー
copy_skill() {
    local skill_name=$1
    local target_dir=$2
    local source="$SKILLS_SOURCE/$skill_name"
    local dest="$target_dir/.claude/skills/$skill_name"

    if [ ! -d "$source" ]; then
        log_error "スキルが見つかりません: $skill_name"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] コピー: $source → $dest"
        return 0
    fi

    if [ -d "$dest" ] && [ "$UPDATE" != true ]; then
        log_warn "スキップ（既存）: $skill_name（--update で上書き）"
        return 0
    fi

    mkdir -p "$dest"
    cp -r "$source/"* "$dest/"
    log_success "インストール: $skill_name"
}

# INDEX更新
update_index() {
    local target_dir=$1
    local index_file="$target_dir/.claude/skills/_INDEX.md"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] INDEX更新: $index_file"
        return 0
    fi

    cp "$SKILLS_SOURCE/_INDEX.md" "$index_file"
    log_success "INDEX更新完了"
}

# フレームワークガイドのインストール
install_framework_guide() {
    local target_dir=$1
    local dest_dir="$target_dir/docs"
    local dest_file="$dest_dir/FRAMEWORK_GUIDE.md"

    if [ ! -f "$FRAMEWORK_GUIDE" ]; then
        log_warn "FRAMEWORK_GUIDE.md が見つかりません"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] コピー: $FRAMEWORK_GUIDE → $dest_file"
        return 0
    fi

    mkdir -p "$dest_dir"
    cp "$FRAMEWORK_GUIDE" "$dest_file"
    log_success "FRAMEWORK_GUIDE.md インストール完了"
}

# CLAUDE.mdにフレームワーク参照を追加
update_claude_md() {
    local target_dir=$1
    local claude_md="$target_dir/CLAUDE.md"

    if [ ! -f "$claude_md" ]; then
        log_warn "CLAUDE.md が見つかりません: $claude_md"
        return 0
    fi

    # 既にフレームワーク参照がある場合はスキップ
    if grep -q "FRAMEWORK_GUIDE.md" "$claude_md" 2>/dev/null; then
        log_info "CLAUDE.md は既にフレームワーク参照を含んでいます"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] CLAUDE.md にフレームワーク参照を追加"
        return 0
    fi

    # CLAUDE.mdの先頭にフレームワーク参照を追加
    local temp_file=$(mktemp)
    cat > "$temp_file" << 'FRAMEWORK_REF'
> **重要**: このプロジェクトはAI開発フレームワークを使用しています。
> 開発フロー、スキルシステム、合議制については `docs/FRAMEWORK_GUIDE.md` を参照してください。

---

FRAMEWORK_REF
    cat "$claude_md" >> "$temp_file"
    mv "$temp_file" "$claude_md"
    log_success "CLAUDE.md にフレームワーク参照を追加"
}

# メイン処理
main() {
    local TARGET_DIR=""
    local INSTALL_ALL=false
    local PHASES=()
    local INSTALL_TEAMS=false
    local INSTALL_DELIBERATION=false
    local UPDATE=false
    local DRY_RUN=false

    # 引数解析
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--all)
                INSTALL_ALL=true
                shift
                ;;
            -p|--phase)
                PHASES+=("$2")
                shift 2
                ;;
            -t|--teams)
                INSTALL_TEAMS=true
                shift
                ;;
            -d|--deliberation)
                INSTALL_DELIBERATION=true
                shift
                ;;
            -u|--update)
                UPDATE=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                TARGET_DIR="$1"
                shift
                ;;
        esac
    done

    # 検証
    if [ -z "$TARGET_DIR" ]; then
        log_error "対象プロジェクトパスを指定してください"
        usage
        exit 1
    fi

    if [ ! -d "$TARGET_DIR" ]; then
        log_error "ディレクトリが存在しません: $TARGET_DIR"
        exit 1
    fi

    if [ ! -d "$SKILLS_SOURCE" ]; then
        log_error "フレームワークのスキルが見つかりません: $SKILLS_SOURCE"
        log_error "FRAMEWORK_ROOT環境変数を設定してください"
        exit 1
    fi

    # 対象スキルの決定
    local SKILLS_TO_INSTALL=()

    if [ "$INSTALL_ALL" = true ]; then
        SKILLS_TO_INSTALL=(
            "deliberation"
            "agent-teams"
            "discovery"
            "business"
            "product"
            "technical"
            "implementation"
            "review-council"
        )
    else
        [ "$INSTALL_DELIBERATION" = true ] && SKILLS_TO_INSTALL+=("deliberation")
        [ "$INSTALL_TEAMS" = true ] && SKILLS_TO_INSTALL+=("agent-teams")

        for phase in "${PHASES[@]}"; do
            SKILLS_TO_INSTALL+=("$phase")
        done
    fi

    if [ ${#SKILLS_TO_INSTALL[@]} -eq 0 ]; then
        log_error "インストールするスキルが指定されていません"
        log_info "使用例: $0 -a /path/to/project"
        exit 1
    fi

    # 実行
    echo ""
    log_info "====== AI開発フレームワーク スキルインストーラー ======"
    log_info "対象: $TARGET_DIR"
    log_info "スキル: ${SKILLS_TO_INSTALL[*]}"
    [ "$UPDATE" = true ] && log_info "モード: 上書き更新"
    [ "$DRY_RUN" = true ] && log_warn "DRY-RUNモード（実際には変更しません）"
    echo ""

    # .claude/skills ディレクトリ作成
    if [ "$DRY_RUN" != true ]; then
        mkdir -p "$TARGET_DIR/.claude/skills"
    fi

    # スキルのインストール
    for skill in "${SKILLS_TO_INSTALL[@]}"; do
        copy_skill "$skill" "$TARGET_DIR"
    done

    # INDEX更新
    update_index "$TARGET_DIR"

    # フレームワークガイドのインストール
    install_framework_guide "$TARGET_DIR"

    # CLAUDE.mdの更新
    update_claude_md "$TARGET_DIR"

    echo ""
    log_success "====== インストール完了 ======"
    echo ""
    log_info "次のステップ:"
    echo "  1. cd $TARGET_DIR"
    echo "  2. cat docs/FRAMEWORK_GUIDE.md でフレームワーク概念を確認"
    echo "  3. cat .claude/skills/_INDEX.md でスキル一覧を確認"
    echo "  4. 「ディスカバリーを開始して」などでスキルを実行"
    echo ""
}

main "$@"
