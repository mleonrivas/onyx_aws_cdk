#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { RagMytoslabStack } from '../lib/rag-mytoslab-stack';

const app = new cdk.App();

new RagMytoslabStack(app, 'RagMytoslabStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1'
  }
});
