# AWS CloudTrail Integration with Glue Data Lake

CDK implementation for ingesting AWS CloudTrail logs into a self-managed data lake using AWS Glue and Lake Formation.

## Architecture

Extends the basic Lake Formation setup with CloudTrail log ingestion:
- **CloudTrail**: Multi-region trail capturing all API calls, S3, and Lambda data events
- **Glue Catalog**: Partitioned table for CloudTrail logs with projection enabled
- **Lake Formation**: Manages access control for CloudTrail data
- **S3**: Separate encrypted buckets for CloudTrail logs and query results
- **Athena**: Workgroup for querying CloudTrail logs

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js and npm installed
- AWS CDK CLI installed (`npm install -g aws-cdk`)

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Deploy to AWS
npm run deploy
```

## CloudTrail Configuration

### Trail Setup
- Full management and data event logging
- CloudWatch Logs integration with 10-year retention
- Insights enabled for API call and error rate analysis
- KMS encryption for log files

### Table Schema
Glue table with CloudTrail-specific schema:
- **Partition keys**: region, year, month, day
- **Projection**: Automatic partition discovery enabled
- **Data format**: CloudTrail JSON logs
- **Location**: `s3://cloudtrail-bucket-{account}/AWSLogs/{account}/CloudTrail/`

## Security Implementation

### Encryption
- Separate KMS keys for CloudTrail logs, trail encryption, and catalog
- All KMS keys with automatic rotation enabled
- Bucket key enabled for S3 performance optimization

### Access Control
- Lake Formation permissions for IAM user access
- Service-linked role for Lake Formation data access
- CloudTrail granted encryption permissions for log delivery

### Bucket Configuration
- SSL enforcement on all buckets
- Public access blocked
- Server access logging to centralized logging bucket
- Object ownership enforced

## Key Differences from Base Setup

1. **CloudTrail Integration**: Full trail with data events and insights
2. **Partitioned Table**: Year/month/day/region partitioning with projection
3. **Additional KMS Keys**: Separate keys for CloudTrail logs and trail encryption
4. **CloudWatch Logs**: Trail events sent to CloudWatch with long retention
5. **Registered Locations**: Both data lake and CloudTrail buckets registered in Lake Formation

## Querying CloudTrail Data

Example Athena query using partition projection:

```sql
SELECT eventname, useridentity, eventtime
FROM sample_database.cloudtrail_logs
WHERE year = '2025' 
  AND month = '08'
  AND region = 'us-east-1'
  AND eventname LIKE 'Describe%'
LIMIT 10;
```

## Project Structure

```
├── lib/
│   └── sample_cloudtrail_with_glue-stack.ts  # Main CDK stack with CloudTrail integration
├── test/
│   └── sample_cloudtrail_with_glue.test.ts   # Unit tests for CloudTrail components
├── bin/
│   └── sample_cloudtrail_with_glue.ts        # CDK app entry point
└── package.json
```

## Removal

Stack includes removal policies for development. All resources will be deleted on stack destruction:
```bash
cdk destroy
```