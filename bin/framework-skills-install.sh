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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="${FRAMEWORK_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SKILLS_SOURCE="$FRAMEWORK_ROOT/.claude/skills"
ALL_SKILLS=(
    "agent-teams"
    "design"
    "discovery"
    "gate-design"
    "gate-quality"
    "gate-release"
    "implement"
    "review"
    "scan-updates"
    "self-improve"
)

# 使い方
usage() {
    echo "使い方: $0 [オプション] <対象プロジェクトパス>"
    echo ""
    echo "オプション:"
    echo "  -a, --all          全スキルをインストール"
    echo "  -p, --phase <name> 特定フェーズのみ ($(skill_names_with_separator '|'))"
    echo "  -t, --teams        Agent Teamsパターンのみ"
    echo "  -u, --update       既存スキルを上書き更新"
    echo "  -n, --dry-run      実行せずに確認のみ（対象パスなしならインベントリ検証のみ）"
    echo "  -h, --help         このヘルプを表示"
    echo ""
    echo "例:"
    echo "  $0 -a /path/to/my-project"
    echo "  $0 -p discovery -p design /path/to/my-project"
    echo "  $0 -t /path/to/my-project"
    echo "  $0 --dry-run"
}

# ログ関数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

skill_names_with_separator() {
    local separator=$1
    local IFS="$separator"
    echo "${ALL_SKILLS[*]}"
}

has_skill() {
    local requested=$1
    local skill
    for skill in "${ALL_SKILLS[@]}"; do
        if [ "$skill" = "$requested" ]; then
            return 0
        fi
    done
    return 1
}

validate_skill_inventory() {
    local expected
    local actual

    expected="$(printf '%s\n' "${ALL_SKILLS[@]}" | sort)"
    actual="$(find "$SKILLS_SOURCE" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)"

    if [ "$expected" != "$actual" ]; then
        log_error "スキル一覧が .claude/skills と一致していません"
        log_error "期待値: $(printf '%s\n' "${ALL_SKILLS[@]}" | sort | tr '\n' ' ')"
        log_error "実際:   $(find "$SKILLS_SOURCE" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort | tr '\n' ' ')"
        exit 1
    fi

    local skill
    for skill in "${ALL_SKILLS[@]}"; do
        if [ ! -d "$SKILLS_SOURCE/$skill" ]; then
            log_error "スキルディレクトリが見つかりません: $skill"
            exit 1
        fi
        if [ ! -f "$SKILLS_SOURCE/$skill/SKILL.md" ]; then
            log_error "SKILL.md が見つかりません: $skill"
            exit 1
        fi
    done

    if [ ! -f "$SKILLS_SOURCE/_INDEX.md" ]; then
        log_error "スキル INDEX が見つかりません: $SKILLS_SOURCE/_INDEX.md"
        exit 1
    fi
}

validate_requested_skills() {
    local skill
    for skill in "$@"; do
        if ! has_skill "$skill"; then
            log_error "未対応のスキルです: $skill"
            log_error "利用可能なスキル: $(skill_names_with_separator ' ')"
            exit 1
        fi
    done
}

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

# メイン処理
main() {
    local TARGET_DIR=""
    local INSTALL_ALL=false
    local PHASES=()
    local INSTALL_TEAMS=false
    local UPDATE=false
    local DRY_RUN=false
    local INVENTORY_ONLY=false

    # 引数解析
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--all)
                INSTALL_ALL=true
                shift
                ;;
            -p|--phase)
                if [ $# -lt 2 ] || [[ "$2" == -* ]]; then
                    log_error "--phase にはスキル名が必要です"
                    exit 1
                fi
                PHASES+=("$2")
                shift 2
                ;;
            -t|--teams)
                INSTALL_TEAMS=true
                shift
                ;;
            -d|--deliberation)
                log_error "--deliberation は廃止されました。現在の実在スキルは: $(skill_names_with_separator ' ')"
                exit 1
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
            -*)
                log_error "不明なオプションです: $1"
                usage
                exit 1
                ;;
            *)
                TARGET_DIR="$1"
                shift
                ;;
        esac
    done

    if [ ! -d "$SKILLS_SOURCE" ]; then
        log_error "フレームワークのスキルが見つかりません: $SKILLS_SOURCE"
        log_error "FRAMEWORK_ROOT環境変数を設定してください"
        exit 1
    fi

    validate_skill_inventory

    # 対象スキルの決定
    local SKILLS_TO_INSTALL=()

    if [ "$INSTALL_ALL" = true ]; then
        SKILLS_TO_INSTALL=("${ALL_SKILLS[@]}")
    else
        [ "$INSTALL_TEAMS" = true ] && SKILLS_TO_INSTALL+=("agent-teams")

        for phase in "${PHASES[@]}"; do
            SKILLS_TO_INSTALL+=("$phase")
        done
    fi

    if [ ${#SKILLS_TO_INSTALL[@]} -eq 0 ]; then
        if [ "$DRY_RUN" = true ] && [ -z "$TARGET_DIR" ]; then
            SKILLS_TO_INSTALL=("${ALL_SKILLS[@]}")
            INVENTORY_ONLY=true
        else
            log_error "インストールするスキルが指定されていません"
            log_info "使用例: $0 -a /path/to/project"
            exit 1
        fi
    fi

    validate_requested_skills "${SKILLS_TO_INSTALL[@]}"

    if [ -z "$TARGET_DIR" ]; then
        if [ "$DRY_RUN" = true ]; then
            INVENTORY_ONLY=true
        else
            log_error "対象プロジェクトパスを指定してください"
            usage
            exit 1
        fi
    fi

    if [ "$INVENTORY_ONLY" != true ] && [ ! -d "$TARGET_DIR" ]; then
        log_error "ディレクトリが存在しません: $TARGET_DIR"
        exit 1
    fi

    # 実行
    echo ""
    log_info "====== AI開発フレームワーク スキルインストーラー ======"
    if [ "$INVENTORY_ONLY" = true ]; then
        log_info "対象: インベントリ検証のみ"
    else
        log_info "対象: $TARGET_DIR"
    fi
    log_info "スキル: ${SKILLS_TO_INSTALL[*]}"
    [ "$UPDATE" = true ] && log_info "モード: 上書き更新"
    [ "$DRY_RUN" = true ] && log_warn "DRY-RUNモード（実際には変更しません）"
    echo ""

    if [ "$INVENTORY_ONLY" = true ]; then
        log_success "スキルインベントリ検証完了"
        return 0
    fi

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

    echo ""
    log_success "====== インストール完了 ======"
    echo ""
    log_info "次のステップ:"
    echo "  1. cd $TARGET_DIR"
    echo "  2. cat .claude/skills/_INDEX.md でスキル一覧を確認"
    echo "  3. 「ディスカバリーを開始して」などでスキルを実行"
    echo ""
}

main "$@"
