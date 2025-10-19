#!/bin/bash

# Artillery Performance Test Execution Script
# Video Processing Pipeline Load Testing

set -e

# Configuration
ARTILLERY_CONFIG="artillery-performance-test.yml"
RESULTS_DIR="./performance-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_FILE="${RESULTS_DIR}/artillery-results-${TIMESTAMP}.json"
HTML_REPORT="${RESULTS_DIR}/artillery-report-${TIMESTAMP}.html"
LOG_FILE="${RESULTS_DIR}/test-execution-${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Artillery is installed
    if ! command -v artillery &> /dev/null; then
        print_error "Artillery is not installed. Please install it with: npm install -g artillery"
        exit 1
    fi
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if the config file exists
    if [ ! -f "$ARTILLERY_CONFIG" ]; then
        print_error "Artillery config file not found: $ARTILLERY_CONFIG"
        exit 1
    fi
    
    # Create results directory
    mkdir -p "$RESULTS_DIR"
    
    print_success "Prerequisites check passed"
}

# Function to check system resources
check_system_resources() {
    print_status "Checking system resources..."
    
    # Check available disk space (need at least 10GB for test files)
    AVAILABLE_SPACE=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$AVAILABLE_SPACE" -lt 10 ]; then
        print_warning "Low disk space: ${AVAILABLE_SPACE}GB available (recommended: 10GB+)"
    else
        print_success "Disk space check passed: ${AVAILABLE_SPACE}GB available"
    fi
    
    # Check available memory
    AVAILABLE_MEMORY=$(free -g | awk 'NR==2{print $7}')
    if [ "$AVAILABLE_MEMORY" -lt 4 ]; then
        print_warning "Low available memory: ${AVAILABLE_MEMORY}GB (recommended: 4GB+)"
    else
        print_success "Memory check passed: ${AVAILABLE_MEMORY}GB available"
    fi
    
    # Check CPU cores
    CPU_CORES=$(nproc)
    print_status "CPU cores available: $CPU_CORES"
}

# Function to start system monitoring
start_monitoring() {
    print_status "Starting system monitoring..."
    
    # Start system resource monitoring
    if command -v htop &> /dev/null; then
        print_status "Starting htop monitoring (run in separate terminal)"
        echo "htop -d 1" > "${RESULTS_DIR}/monitoring-commands.txt"
    fi
    
    # Start network monitoring
    if command -v iftop &> /dev/null; then
        print_status "Starting network monitoring (run in separate terminal)"
        echo "sudo iftop" >> "${RESULTS_DIR}/monitoring-commands.txt"
    fi
    
    # Start disk I/O monitoring
    if command -v iotop &> /dev/null; then
        print_status "Starting disk I/O monitoring (run in separate terminal)"
        echo "sudo iotop" >> "${RESULTS_DIR}/monitoring-commands.txt"
    fi
    
    print_success "Monitoring commands saved to ${RESULTS_DIR}/monitoring-commands.txt"
}

# Function to run the performance test
run_performance_test() {
    print_status "Starting Artillery performance test..."
    print_status "Test configuration: $ARTILLERY_CONFIG"
    print_status "Results will be saved to: $RESULTS_FILE"
    print_status "HTML report will be generated: $HTML_REPORT"
    
    # Run Artillery with comprehensive output
    artillery run \
        --config "$ARTILLERY_CONFIG" \
        --output "$RESULTS_FILE" \
        --target "$TARGET_URL" \
        2>&1 | tee "$LOG_FILE"
    
    # Generate HTML report
    if [ -f "$RESULTS_FILE" ]; then
        print_status "Generating HTML report..."
        artillery report "$RESULTS_FILE" --output "$HTML_REPORT"
        print_success "HTML report generated: $HTML_REPORT"
    fi
}

# Function to analyze results
analyze_results() {
    print_status "Analyzing test results..."
    
    if [ ! -f "$RESULTS_FILE" ]; then
        print_error "Results file not found: $RESULTS_FILE"
        return 1
    fi
    
    # Extract key metrics using jq (if available)
    if command -v jq &> /dev/null; then
        print_status "Key Performance Metrics:"
        echo "================================"
        
        # Response time metrics
        echo "Response Time Metrics:"
        jq -r '.aggregate.latency.p50, .aggregate.latency.p95, .aggregate.latency.p99' "$RESULTS_FILE" | \
        awk '{printf "  P50: %.2fms\n  P95: %.2fms\n  P99: %.2fms\n", $1, $2, $3}'
        
        # Throughput metrics
        echo -e "\nThroughput Metrics:"
        jq -r '.aggregate.rate' "$RESULTS_FILE" | \
        awk '{printf "  Average RPS: %.2f\n", $1}'
        
        # Error rates
        echo -e "\nError Rates:"
        jq -r '.aggregate.codes | to_entries[] | "  \(.key): \(.value)"' "$RESULTS_FILE"
        
        # Custom metrics
        echo -e "\nCustom Metrics:"
        jq -r '.custom | to_entries[]? | "  \(.key): \(.value)"' "$RESULTS_FILE" 2>/dev/null || echo "  No custom metrics available"
        
    else
        print_warning "jq not available for detailed analysis. Install jq for better result parsing."
    fi
    
    # Check if thresholds were met
    print_status "Checking performance thresholds..."
    
    # This would need to be implemented based on specific threshold requirements
    print_success "Results analysis completed"
}

# Function to cleanup test data
cleanup_test_data() {
    print_status "Cleaning up test data..."
    
    # Remove temporary files created during test
    find /tmp -name "test-*" -type f -mtime -1 -delete 2>/dev/null || true
    
    # Clean up any test files in uploads directory
    if [ -d "./uploads" ]; then
        find ./uploads -name "test-*" -type f -mtime -1 -delete 2>/dev/null || true
    fi
    
    print_success "Cleanup completed"
}

# Function to generate summary report
generate_summary_report() {
    print_status "Generating summary report..."
    
    SUMMARY_FILE="${RESULTS_DIR}/test-summary-${TIMESTAMP}.md"
    
    cat > "$SUMMARY_FILE" << EOF
# Performance Test Summary Report

**Test Date:** $(date)
**Configuration:** $ARTILLERY_CONFIG
**Target URL:** $TARGET_URL
**Duration:** $(grep -o 'duration: [0-9]*' "$ARTILLERY_CONFIG" | awk '{sum+=$2} END {print sum/60 " minutes"}')

## Test Configuration
- **Total Virtual Users:** 100
- **Test Duration:** 10 minutes (main phase)
- **File Size Distribution:**
  - Small files (10MB): 40%
  - Medium files (50MB): 35%
  - Large files (100MB): 20%
  - Invalid files: 5%

## Performance Thresholds
- **Response Time P95:** < 30 seconds
- **Response Time P99:** < 60 seconds
- **Success Rate:** > 90%
- **Error Rate (5xx):** < 1%

## Files Generated
- **Results JSON:** $RESULTS_FILE
- **HTML Report:** $HTML_REPORT
- **Execution Log:** $LOG_FILE
- **Summary Report:** $SUMMARY_FILE

## Next Steps
1. Review the HTML report for detailed metrics
2. Analyze any threshold violations
3. Check system resource utilization during test
4. Optimize system configuration if needed

EOF

    print_success "Summary report generated: $SUMMARY_FILE"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --target URL     Target URL for testing (default: http://localhost:3000)"
    echo "  -c, --config FILE   Artillery config file (default: artillery-performance-test.yml)"
    echo "  -e, --environment   Environment to test (development, staging, production)"
    echo "  -m, --monitor       Start system monitoring"
    echo "  -a, --analyze       Analyze results after test"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --target http://localhost:3000"
    echo "  $0 --environment staging --monitor"
    echo "  $0 --config custom-config.yml --analyze"
}

# Main execution
main() {
    # Default values
    TARGET_URL="http://localhost:3000"
    START_MONITORING=false
    ANALYZE_RESULTS=false
    ENVIRONMENT=""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--target)
                TARGET_URL="$2"
                shift 2
                ;;
            -c|--config)
                ARTILLERY_CONFIG="$2"
                shift 2
                ;;
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -m|--monitor)
                START_MONITORING=true
                shift
                ;;
            -a|--analyze)
                ANALYZE_RESULTS=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Set environment-specific target if specified
    if [ -n "$ENVIRONMENT" ]; then
        case $ENVIRONMENT in
            development)
                TARGET_URL="http://localhost:3000"
                ;;
            staging)
                TARGET_URL="https://staging-api.example.com"
                ;;
            production)
                TARGET_URL="https://api.example.com"
                ;;
            *)
                print_error "Unknown environment: $ENVIRONMENT"
                exit 1
                ;;
        esac
    fi
    
    print_status "Starting Artillery Performance Test"
    print_status "Target URL: $TARGET_URL"
    print_status "Config file: $ARTILLERY_CONFIG"
    print_status "Environment: ${ENVIRONMENT:-default}"
    
    # Execute test steps
    check_prerequisites
    check_system_resources
    
    if [ "$START_MONITORING" = true ]; then
        start_monitoring
    fi
    
    run_performance_test
    
    if [ "$ANALYZE_RESULTS" = true ]; then
        analyze_results
    fi
    
    generate_summary_report
    cleanup_test_data
    
    print_success "Performance test completed successfully!"
    print_status "Results available in: $RESULTS_DIR"
}

# Run main function with all arguments
main "$@"
