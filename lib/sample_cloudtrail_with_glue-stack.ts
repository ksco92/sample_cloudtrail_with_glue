import * as cdk from 'aws-cdk-lib';
import {
    DefaultStackSynthesizer, Fn, RemovalPolicy,
} from 'aws-cdk-lib';
import {
    Construct,
} from 'constructs';
import {
    ArnPrincipal, ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
    Key,
} from "aws-cdk-lib/aws-kms";
import {
    BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership,
} from "aws-cdk-lib/aws-s3";
import {
    CfnDataCatalogEncryptionSettings,
} from "aws-cdk-lib/aws-glue";
import {
    CfnDataLakeSettings, CfnPermissions, CfnResource,
} from "aws-cdk-lib/aws-lakeformation";
import {
    Database, DataFormat, S3Table, Schema,
} from "@aws-cdk/aws-glue-alpha";
import {
    CfnWorkGroup,
} from "aws-cdk-lib/aws-athena";
import {
    InsightType, Trail,
} from "aws-cdk-lib/aws-cloudtrail";
import {
    RetentionDays,
} from "aws-cdk-lib/aws-logs";

export class SampleCloudtrailWithGlueStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Security

        const myUser = new ArnPrincipal(`arn:aws:iam::${this.account}:user/rodrigo`)

        const dataLakeBucketKmsKey = new Key(this, 'DataLakeBucketKmsKey', {
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const athenaResultsBucketKmsKey = new Key(this, 'AthenaResultsBucketKmsKey', {
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const cloudtrailBucketKmsKey = new Key(this, 'CloudtrailBucketKmsKey', {
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const cloudtrailKmsKey = new Key(this, 'CloudtrailKmsKey', {
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        cloudtrailKmsKey.grantEncrypt(new ServicePrincipal('cloudtrail.amazonaws.com'))

        const catalogKmsKey = new Key(this, 'CatalogKmsKey', {
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const lfServiceRoleArn = `arn:${this.partition}:iam::${this.account}:role/aws-service-role/lakeformation.amazonaws.com/AWSServiceRoleForLakeFormationDataAccess`;

        const lfAdmins = [
            myUser,
            new ArnPrincipal(Fn.sub((this.synthesizer as DefaultStackSynthesizer).cloudFormationExecutionRoleArn)),
        ];

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Buckets

        const loggingBucket = new Bucket(this, 'LoggingBucket', {
            bucketName: `logging-${this.account}`,
            encryption: BucketEncryption.S3_MANAGED,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            objectOwnership: ObjectOwnership.OBJECT_WRITER,
        });

        const dataLakeBucket = new Bucket(this, 'DataLakeBucket', {
            bucketName: `data-lake-bucket-${this.account}`,
            encryptionKey: dataLakeBucketKmsKey,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
            bucketKeyEnabled: true,
            serverAccessLogsBucket: loggingBucket,
            serverAccessLogsPrefix: `data-lake-bucket-${this.account}/`,
        });

        const athenaResultsBucket = new Bucket(this, 'AthenaResultsBucket', {
            bucketName: `athena-results-bucket-${this.account}`,
            encryptionKey: athenaResultsBucketKmsKey,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
            bucketKeyEnabled: true,
            serverAccessLogsBucket: loggingBucket,
            serverAccessLogsPrefix: `athena-results-bucket-${this.account}/`,
        });

        const cloudtrailBucket = new Bucket(this, 'CloudtrailBucket', {
            bucketName: `cloudtrail-bucket-${this.account}`,
            encryptionKey: cloudtrailBucketKmsKey,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
            bucketKeyEnabled: true,
            serverAccessLogsBucket: loggingBucket,
            serverAccessLogsPrefix: `athena-results-bucket-${this.account}/`,
        });

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Bucket permissions

        const buckets = [
            athenaResultsBucket,
            dataLakeBucket,
            cloudtrailBucket,
        ]

        buckets.forEach(bucket => {
            bucket.grantReadWrite(new ArnPrincipal(lfServiceRoleArn))
        });

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Cloudtrail

        const trail = new Trail(this, 'FullTrail', {
            trailName: `FullTrail`,
            bucket: cloudtrailBucket,
            encryptionKey: cloudtrailKmsKey,
            insightTypes: [
                InsightType.API_CALL_RATE,
                InsightType.API_ERROR_RATE,
            ],
            sendToCloudWatchLogs: true,
            cloudWatchLogsRetention: RetentionDays.TEN_YEARS,
        });

        trail.applyRemovalPolicy(RemovalPolicy.DESTROY);
        trail.logAllS3DataEvents();
        trail.logAllLambdaDataEvents();
        cloudtrailKmsKey.grantDecrypt(new ArnPrincipal(lfServiceRoleArn));

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Catalog settings

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Catalog encryption

        new CfnDataCatalogEncryptionSettings(this, 'CatalogEncryptionSettings', {
            catalogId: this.account,
            dataCatalogEncryptionSettings: {
                encryptionAtRest: {
                    catalogEncryptionMode: 'SSE-KMS',
                    sseAwsKmsKeyId: catalogKmsKey.keyId,
                },
            },
        });

        lfAdmins.forEach(admin => {
            catalogKmsKey.grantEncryptDecrypt(admin);
        })

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Catalog settings

        new CfnDataLakeSettings(this, 'DataLakeSettings', {
            admins: lfAdmins.map(admin => ({
                dataLakePrincipalIdentifier: admin.arn,
            })),
            parameters: {
                CROSS_ACCOUNT_VERSION: 4,
            },
            mutationType: 'REPLACE',
            createDatabaseDefaultPermissions: [

            ],
            createTableDefaultPermissions: [

            ],
        });

        new CfnResource(this, 'DataLakeRegisteredLocation', {
            resourceArn: `${dataLakeBucket.bucketArn}/`,
            useServiceLinkedRole: true,
            hybridAccessEnabled: true,
            roleArn: lfServiceRoleArn,
        });

        new CfnResource(this, 'CloudtrailRegisteredLocation', {
            resourceArn: `${cloudtrailBucket.bucketArn}/`,
            useServiceLinkedRole: true,
            hybridAccessEnabled: true,
            roleArn: lfServiceRoleArn,
        });

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Athena WG

        new CfnWorkGroup(this, 'ReadOnlyWorkGroup', {
            name: 'ReadOnly',
            workGroupConfiguration: {
                publishCloudWatchMetricsEnabled: true,
                resultConfiguration: {
                    outputLocation: `s3://${athenaResultsBucket.bucketName}/ReadOnlyWorkGroup`,
                },
            },
            recursiveDeleteOption: true,
        })

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Database

        const databaseName = 'sample_database'

        const glueDatabase = new Database(this, 'SampleDatabase', {
            databaseName: databaseName,
            description: 'This is the description.',
            locationUri: `s3://${dataLakeBucket.bucketName}/${databaseName}/`,
        });

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Table

        const tableName = 'cloudtrail_logs';

        const glueTable = new S3Table(this, 'CloudtrailTable', {
            tableName: tableName,
            description: 'Cloudtrail logs.',
            partitionKeys: [
                {
                    name: "region",
                    type: Schema.STRING,
                    comment: "AWS Region where the API call was made", 
                },
                {
                    name: "year",
                    type: Schema.STRING,
                    comment: "Year of the CloudTrail event", 
                },
                {
                    name: "month",
                    type: Schema.STRING,
                    comment: "Month of the CloudTrail event", 
                },
                {
                    name: "day",
                    type: Schema.STRING,
                    comment: "Day of the CloudTrail event", 
                },
            ],
            columns: [
                {
                    name: "eventversion",
                    type: Schema.STRING,
                    comment: "Version of the CloudTrail event format, currently 1.11", 
                },
                {
                    name: "useridentity",
                    type: Schema.struct([
                        {
                            name: "type",
                            type: Schema.STRING, 
                        },
                        {
                            name: "principalid",
                            type: Schema.STRING, 
                        },
                        {
                            name: "arn",
                            type: Schema.STRING, 
                        },
                        {
                            name: "accountid",
                            type: Schema.STRING,
                        },
                        {
                            name: "invokedby",
                            type: Schema.STRING, 
                        },
                        {
                            name: "accesskeyid",
                            type: Schema.STRING, 
                        },
                        {
                            name: "userName",
                            type: Schema.STRING, 
                        },
                        {
                            name: "sessioncontext",
                            type: Schema.struct([
                                {
                                    name: "attributes",
                                    type: Schema.struct([
                                        {
                                            name: "mfaauthenticated",
                                            type: Schema.STRING, 
                                        },
                                        {
                                            name: "creationdate",
                                            type: Schema.STRING, 
                                        },
                                    ]),
                                },
                                {
                                    name: "sessionissuer",
                                    type: Schema.struct([
                                        {
                                            name: "type",
                                            type: Schema.STRING, 
                                        },
                                        {
                                            name: "principalId",
                                            type: Schema.STRING, 
                                        },
                                        {
                                            name: "arn",
                                            type: Schema.STRING, 
                                        },
                                        {
                                            name: "accountId",
                                            type: Schema.STRING, 
                                        },
                                        {
                                            name: "userName",
                                            type: Schema.STRING, 
                                        },
                                    ]),
                                },
                            ]),
                        },
                    ]),
                    comment: "Contains information about the IAM identity that made the request",
                },
                {
                    name: "eventtime",
                    type: Schema.STRING,
                    comment: "Timestamp when the request was completed in UTC", 
                },
                {
                    name: "eventsource",
                    type: Schema.STRING,
                    comment: "AWS service that received the request (e.g., ec2.amazonaws.com)", 
                },
                {
                    name: "eventname",
                    type: Schema.STRING,
                    comment: "Specific action requested in the service's API", 
                },
                {
                    name: "awsregion",
                    type: Schema.STRING,
                    comment: "AWS Region where the request was made (e.g., us-east-2)", 
                },
                {
                    name: "sourceipaddress",
                    type: Schema.STRING,
                    comment: "IP address origin of the request, often 'AWS Internal' for AWS-originated events", 
                },
                {
                    name: "useragent",
                    type: Schema.STRING,
                    comment: "Tool/method used to make the request (e.g., AWS CLI, SDK, Management Console)", 
                },
                {
                    name: "errorcode",
                    type: Schema.STRING,
                    comment: "AWS service error code if the request failed", 
                },
                {
                    name: "errormessage",
                    type: Schema.STRING,
                    comment: "Detailed description of the error that occurred during the request", 
                },
                {
                    name: "requestparameters",
                    type: Schema.STRING,
                    comment: "Parameters sent with the request, up to 100 KB", 
                },
                {
                    name: "responseelements",
                    type: Schema.STRING,
                    comment: "Response data for actions that create, update, or delete resources", 
                },
                {
                    name: "additionaleventdata",
                    type: Schema.STRING,
                    comment: "Extra event information not in request or response, up to 28 KB", 
                },
                {
                    name: "requestid",
                    type: Schema.STRING,
                    comment: "Unique identifier for the request generated by the service", 
                },
                {
                    name: "eventid",
                    type: Schema.STRING,
                    comment: "CloudTrail-generated GUID to uniquely identify each event", 
                },
                {
                    name: "resources",
                    type: Schema.array(
                        Schema.struct([
                            {
                                name: "ARN",
                                type: Schema.STRING, 
                            },
                            {
                                name: "accountId",
                                type: Schema.STRING, 
                            },
                            {
                                name: "type",
                                type: Schema.STRING, 
                            },
                        ]),
                    ),
                    comment: "List of resources accessed during the event, including ARNs and account IDs",
                },
                {
                    name: "eventtype",
                    type: Schema.STRING,
                    comment: "Categorizes the event type (e.g., AwsApiCall, AwsConsoleSignIn)", 
                },
                {
                    name: "apiversion",
                    type: Schema.STRING,
                    comment: "API version associated with AwsApiCall events", 
                },
                {
                    name: "readonly",
                    type: Schema.STRING,
                    comment: "Indicates whether the operation is read-only or write-only", 
                },
                {
                    name: "recipientaccountid",
                    type: Schema.STRING,
                    comment: "Account ID that received the event, potentially different from the user's account", 
                },
                {
                    name: "serviceeventdetails",
                    type: Schema.STRING,
                    comment: "Details about service-generated events", 
                },
                {
                    name: "sharedeventid",
                    type: Schema.STRING,
                    comment: "GUID for events delivered to multiple accounts", 
                },
                {
                    name: "vpcendpointid",
                    type: Schema.STRING,
                    comment: "VPC endpoint ID if the request was made via a VPC endpoint", 
                },
            ],
            dataFormat: DataFormat.CLOUDTRAIL_LOGS,
            database: glueDatabase,
            bucket: cloudtrailBucket,
            s3Prefix: `AWSLogs/${this.account}/CloudTrail/`,
            parameters: {
                classification: 'cloudtrail',
                'projection.enabled': 'true',
                'projection.day.type': 'integer',
                'projection.day.range': '01,31',
                'projection.day.digits': '2',
                'projection.month.type': 'integer',
                'projection.month.range': '01,12',
                'projection.month.digits': '2',
                'projection.region.type': 'enum',
                // output of:
                // aws ec2 describe-regions --query 'Regions[].RegionName' --output text | tr '\t' ','
                'projection.region.values': 'ap-south-1,eu-north-1,eu-west-3,eu-west-2,eu-west-1,ap-northeast-3,ap-northeast-2,ap-northeast-1,ca-central-1,sa-east-1,ap-southeast-1,ap-southeast-2,eu-central-1,us-east-1,us-east-2,us-west-1,us-west-2',
                'projection.year.type': 'integer',
                'projection.year.range': '2025,2030',
                'storage.location.template': `s3://${cloudtrailBucket.bucketName}/AWSLogs/${this.account}/CloudTrail/\${region}/\${year}/\${month}/\${day}`,
            },
        });

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Permissions

        new CfnPermissions(this, 'DatabasePermission', {
            permissions: [
                'DESCRIBE',
            ],
            permissionsWithGrantOption: [

            ],
            resource: {
                databaseResource: {
                    catalogId: this.account,
                    name: glueDatabase.databaseName,
                },
            },
            dataLakePrincipal: {
                dataLakePrincipalIdentifier: myUser.arn,
            },
        });

        new CfnPermissions(this, 'TablePermission', {
            permissions: [
                'DESCRIBE',
                'SELECT',
            ],
            permissionsWithGrantOption: [

            ],
            resource: {
                tableResource: {
                    catalogId: this.account,
                    name: glueTable.tableName,
                    databaseName: glueDatabase.databaseName,
                },
            },
            dataLakePrincipal: {
                dataLakePrincipalIdentifier: myUser.arn,
            },
        });
    }
}
