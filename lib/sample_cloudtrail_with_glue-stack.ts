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
    CfnDataLakeSettings, CfnResource,
} from "aws-cdk-lib/aws-lakeformation";
import {
    Database,
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

// import * as sqs from 'aws-cdk-lib/aws-sqs';

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

        athenaResultsBucket.grantReadWrite(new ArnPrincipal(lfServiceRoleArn));
        dataLakeBucket.grantReadWrite(new ArnPrincipal(lfServiceRoleArn));

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
        })

        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        /// /////////////////////////////////////////////////
        // Database

        const databaseName = 'sample_database'

        new Database(this, 'SampleDatabase', {
            databaseName: databaseName,
            description: 'This is the description.',
            locationUri: `s3://${dataLakeBucket.bucketName}/${databaseName}/`,
        });
    }
}
