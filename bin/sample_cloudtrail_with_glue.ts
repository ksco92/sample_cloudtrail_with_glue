#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {
    SampleCloudtrailWithGlueStack, 
} from '../lib/sample_cloudtrail_with_glue-stack';

const app = new cdk.App();
new SampleCloudtrailWithGlueStack(app, 'SampleCloudtrailWithGlueStack');