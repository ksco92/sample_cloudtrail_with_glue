import {
    SampleCloudtrailWithGlueStack,
} from "../lib/sample_cloudtrail_with_glue-stack";
import {
    Match, Template,
} from "aws-cdk-lib/assertions";
import {
    App,
} from "aws-cdk-lib";


describe('SampleCloudtrailWithGlueStack', () => {
    let app: App;
    let stack: SampleCloudtrailWithGlueStack;
    let template: Template;

    beforeEach(() => {
        app = new App();
        stack = new SampleCloudtrailWithGlueStack(app, 'TestStack');
        template = Template.fromStack(stack);
    });

    describe('KMS Keys', () => {

        // 1. Data lake bucket
        // 2. Athena bucket
        // 3. Catalog key
        // 4. CT bucket
        // 5. CT
        test('creates three KMS keys with rotation enabled', () => {
            template.resourceCountIs('AWS::KMS::Key', 5);

            template.allResourcesProperties('AWS::KMS::Key', {
                EnableKeyRotation: true,
            });
        });
    });

    describe('S3 Buckets', () => {

        // 1. Data lake bucket
        // 2. Athena bucket
        // 3. Logging
        // 4. CT bucket
        test('Bucket count', () => {
            template.resourceCountIs('AWS::S3::Bucket', 4);
        })

        test('creates logging bucket', () => {
            template.hasResourceProperties('AWS::S3::Bucket', {
                BucketName: {
                    'Fn::Join': [
                        '',
                        Match.arrayWith([
                            Match.stringLikeRegexp('.*logging.*'),
                        ],
                        ),
                    ],
                },
                AccessControl: 'LogDeliveryWrite',
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [
                        {
                            ServerSideEncryptionByDefault: {
                                SSEAlgorithm: 'AES256',
                            },
                        },
                    ],
                },
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
                OwnershipControls: {
                    Rules: [
                        {
                            ObjectOwnership: 'ObjectWriter',
                        },
                    ],
                },
            });
        });

        test('creates the data lake bucket with KMS encryption', () => {
            template.hasResourceProperties('AWS::S3::Bucket', {
                BucketName: {
                    'Fn::Join': [
                        '',
                        Match.arrayWith([
                            Match.stringLikeRegexp('.*data-lake-bucket.*'),
                        ],
                        ),
                    ],
                },
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [
                        {
                            BucketKeyEnabled: true,
                            ServerSideEncryptionByDefault: {
                                SSEAlgorithm: 'aws:kms',
                                KMSMasterKeyID: Match.anyValue(),
                            },
                        },
                    ],
                },
                LoggingConfiguration: {
                    DestinationBucketName: Match.anyValue(),
                },
                OwnershipControls: {
                    Rules: [
                        {
                            ObjectOwnership: 'BucketOwnerEnforced',
                        },
                    ],
                },
            });
        });

        test('creates the athena with KMS encryption', () => {
            template.hasResourceProperties('AWS::S3::Bucket', {
                BucketName: {
                    'Fn::Join': [
                        '',
                        Match.arrayWith([
                            Match.stringLikeRegexp('.*athena-results-bucket.*'),
                        ],
                        ),
                    ],
                },
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [
                        {
                            BucketKeyEnabled: true,
                            ServerSideEncryptionByDefault: {
                                SSEAlgorithm: 'aws:kms',
                                KMSMasterKeyID: Match.anyValue(),
                            },
                        },
                    ],
                },
                LoggingConfiguration: {
                    DestinationBucketName: Match.anyValue(),
                },
                OwnershipControls: {
                    Rules: [
                        {
                            ObjectOwnership: 'BucketOwnerEnforced',
                        },
                    ],
                },
            });
        });
    });

    describe('Glue Data Catalog', () => {
        test('configures catalog encryption with KMS', () => {
            template.hasResourceProperties('AWS::Glue::DataCatalogEncryptionSettings', {
                CatalogId: Match.anyValue(),
                DataCatalogEncryptionSettings: {
                    EncryptionAtRest: {
                        CatalogEncryptionMode: 'SSE-KMS',
                        SseAwsKmsKeyId: Match.anyValue(),
                    },
                },
            });
        });

        test('creates the Glue database', () => {
            template.hasResourceProperties('AWS::Glue::Database', {
                DatabaseInput: {
                    Name: 'sample_database',
                    Description: 'This is the description.',
                },
            });
        });
    });

    describe('Lake Formation', () => {
        test('configures data lake settings with admins', () => {
            template.hasResourceProperties('AWS::LakeFormation::DataLakeSettings', {
                Admins: Match.arrayWith([
                    Match.objectLike({
                        DataLakePrincipalIdentifier: Match.anyValue(),
                    }),
                ]),
                Parameters: {
                    CROSS_ACCOUNT_VERSION: 4,
                },
                MutationType: 'REPLACE',
            });
        });

        test('registers DL location with Lake Formation', () => {
            template.hasResourceProperties('AWS::LakeFormation::Resource', {
                ResourceArn: {
                    "Fn::Join": [
                        "",
                        [
                            {
                                "Fn::GetAtt": [
                                    Match.stringLikeRegexp('.*DataLake.*'),
                                    "Arn",
                                ],
                            },
                            "/",
                        ],
                    ],
                },
                UseServiceLinkedRole: true,
                HybridAccessEnabled: true,
                RoleArn: Match.anyValue(),
            });
        });

        test('registers CT location with Lake Formation', () => {
            template.hasResourceProperties('AWS::LakeFormation::Resource', {
                ResourceArn: {
                    "Fn::Join": [
                        "",
                        [
                            {
                                "Fn::GetAtt": [
                                    Match.stringLikeRegexp('.*Cloudtrail.*'),
                                    "Arn",
                                ],
                            },
                            "/",
                        ],
                    ],
                },
                UseServiceLinkedRole: true,
                HybridAccessEnabled: true,
                RoleArn: Match.anyValue(),
            });
        });

        test('Count of registered locations', () => {
            // 1. CT bucket
            // 2. DL bucket
            template.resourceCountIs('AWS::LakeFormation::Resource', 2);
        });
    });

    describe('Athena', () => {
        test('creates Athena workgroup', () => {
            template.hasResourceProperties('AWS::Athena::WorkGroup', {
                Name: 'ReadOnly',
                WorkGroupConfiguration: {
                    PublishCloudWatchMetricsEnabled: true,
                    ResultConfiguration: {
                        OutputLocation: Match.anyValue(),
                    },
                },
                RecursiveDeleteOption: true,
            });
        });
    });

    describe('Cloudtrail', () => {
        test('creates the trail', () => {
            template.hasResourceProperties('AWS::CloudTrail::Trail', {
                KMSKeyId: Match.anyValue(),
                S3BucketName: Match.anyValue(),
                TrailName: 'FullTrail',
                // One for S3 data events and one for
                // Lambda data events
                EventSelectors: [
                    {
                        DataResources: Match.anyValue(),
                    },
                    {
                        DataResources: Match.anyValue(),
                    },
                ],
                "InsightSelectors": [
                    {
                        "InsightType": "ApiCallRateInsight",
                    },
                    {
                        "InsightType": "ApiErrorRateInsight",
                    },
                ],
            });
        });
    });

});