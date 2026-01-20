#!/bin/bash
#
# Interactive DerbyNet build script
# Clones/updates repository, selects branch, and runs Ant build
#

set -e

REPO_URL="https://github.com/kezarjg/derbynet.git"
REPO_DIR="${DERBYNET_REPO_DIR:-$HOME/derbynet}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}  DerbyNet Build Script${NC}"
    echo -e "${BLUE}======================================${NC}"
    echo
}

print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    print_status "Checking dependencies..."

    local missing=()

    for cmd in git ant java javac ar; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if ! command -v soffice &> /dev/null; then
        print_warning "LibreOffice (soffice) not found - documentation PDFs will be skipped"
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        print_error "Missing required commands: ${missing[*]}"
        echo "Please install the missing packages and try again."
        exit 1
    fi

    print_status "All required dependencies found"
    echo
}

clone_or_update_repo() {
    if [ -d "$REPO_DIR/.git" ]; then
        print_status "Repository exists at $REPO_DIR"
        cd "$REPO_DIR"

        # Check for uncommitted changes
        if ! git diff-index --quiet HEAD -- 2>/dev/null; then
            print_warning "You have uncommitted changes in the repository"
            read -p "Do you want to stash them and continue? [y/N] " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                git stash push -m "Auto-stash by build script $(date)"
                print_status "Changes stashed"
            else
                print_error "Aborting due to uncommitted changes"
                exit 1
            fi
        fi

        print_status "Fetching latest changes from remote..."
        git fetch --all --prune
    else
        print_status "Cloning repository to $REPO_DIR..."
        git clone "$REPO_URL" "$REPO_DIR"
        cd "$REPO_DIR"
    fi
    echo
}

select_branch() {
    print_status "Available branches:"
    echo

    # Get all remote branches, strip 'origin/' prefix, exclude HEAD
    local branches=()
    while IFS= read -r branch; do
        branch="${branch#origin/}"
        if [ "$branch" != "HEAD" ] && [ -n "$branch" ]; then
            branches+=("$branch")
        fi
    done < <(git branch -r --format='%(refname:short)' | sort)

    if [ ${#branches[@]} -eq 0 ]; then
        print_error "No branches found"
        exit 1
    fi

    # Get current branch
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "")

    # Display branches with numbers
    local i=1
    for branch in "${branches[@]}"; do
        if [ "$branch" = "$current_branch" ]; then
            echo -e "  ${GREEN}$i)${NC} $branch ${GREEN}(current)${NC}"
        else
            echo "  $i) $branch"
        fi
        ((i++))
    done
    echo

    # Get user selection
    local selection
    while true; do
        read -p "Select branch number [1-${#branches[@]}]: " selection

        if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le ${#branches[@]} ]; then
            break
        else
            print_error "Invalid selection. Please enter a number between 1 and ${#branches[@]}"
        fi
    done

    SELECTED_BRANCH="${branches[$((selection-1))]}"
    print_status "Selected branch: $SELECTED_BRANCH"
    echo
}

sync_branch() {
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "")

    if [ "$current_branch" != "$SELECTED_BRANCH" ]; then
        print_status "Switching to branch: $SELECTED_BRANCH"

        # Check if local branch exists
        if git show-ref --verify --quiet "refs/heads/$SELECTED_BRANCH"; then
            git checkout "$SELECTED_BRANCH"
        else
            git checkout -b "$SELECTED_BRANCH" "origin/$SELECTED_BRANCH"
        fi
    fi

    print_status "Pulling latest changes..."
    git pull origin "$SELECTED_BRANCH"

    echo
    print_status "Branch synchronized"
    echo -e "  Commit: ${YELLOW}$(git rev-parse --short HEAD)${NC}"
    echo -e "  Date:   $(git log -1 --format='%ci')"
    echo -e "  Author: $(git log -1 --format='%an')"
    echo -e "  Message: $(git log -1 --format='%s')"
    echo
}

select_build_target() {
    print_status "Available build targets:"
    echo
    echo "  1) dist.debian   - Build Debian packages (.deb files)"
    echo "  2) dist.zip      - Build OS-neutral zip distribution"
    echo "  3) generated     - Build generated files only (quick)"
    echo "  4) timer-jar     - Build timer JAR only"
    echo "  5) clean         - Clean build artifacts"
    echo

    local selection
    while true; do
        read -p "Select build target [1-5]: " selection

        case "$selection" in
            1) BUILD_TARGET="dist.debian"; break ;;
            2) BUILD_TARGET="dist.zip"; break ;;
            3) BUILD_TARGET="generated"; break ;;
            4) BUILD_TARGET="timer-jar"; break ;;
            5) BUILD_TARGET="clean"; break ;;
            *) print_error "Invalid selection. Please enter a number between 1 and 5" ;;
        esac
    done

    print_status "Selected target: $BUILD_TARGET"
    echo
}

run_build() {
    print_status "Starting Ant build..."
    echo -e "${BLUE}--------------------------------------${NC}"
    echo

    if ant "$BUILD_TARGET"; then
        echo
        echo -e "${BLUE}--------------------------------------${NC}"
        print_status "Build completed successfully!"

        # Show output files for debian build
        if [ "$BUILD_TARGET" = "dist.debian" ]; then
            echo
            print_status "Generated .deb files:"
            ls -lh ../*.deb 2>/dev/null | while read -r line; do
                echo "  $line"
            done
        elif [ "$BUILD_TARGET" = "dist.zip" ]; then
            echo
            print_status "Generated .zip file:"
            ls -lh ../*.zip 2>/dev/null | while read -r line; do
                echo "  $line"
            done
        fi
    else
        echo
        echo -e "${BLUE}--------------------------------------${NC}"
        print_error "Build failed!"
        exit 1
    fi
}

# Main script
main() {
    print_header
    check_dependencies
    clone_or_update_repo
    select_branch
    sync_branch
    select_build_target
    run_build

    echo
    print_status "Done!"
}

main "$@"
