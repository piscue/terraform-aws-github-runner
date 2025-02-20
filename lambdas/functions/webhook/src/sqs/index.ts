import { SQS, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { WorkflowJobEvent } from '@octokit/webhooks-types';
import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { ConfigDispatcher } from '../ConfigLoader';

const logger = createChildLogger('sqs');

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
  queueId: string;
  queueFifo: boolean;
  repoOwnerType: string;
}

export interface MatcherConfig {
  labelMatchers: string[][];
  exactMatch: boolean;
}

export type RunnerConfig = RunnerMatcherConfig[];

export interface RunnerMatcherConfig {
  matcherConfig: MatcherConfig;
  id: string;
  arn: string;
  fifo: boolean;
}

export interface GithubWorkflowEvent {
  workflowJobEvent: WorkflowJobEvent;
}

export const sendActionRequest = async (message: ActionRequestMessage): Promise<void> => {
  const sqs = getTracedAWSV3Client(new SQS({ region: process.env.AWS_REGION }));

  const sqsMessage: SendMessageCommandInput = {
    QueueUrl: message.queueId,
    MessageBody: JSON.stringify(message),
  };

  logger.debug(`sending message to SQS: ${JSON.stringify(sqsMessage)}`);
  if (message.queueFifo) {
    sqsMessage.MessageGroupId = String(message.id);
  }

  await sqs.sendMessage(sqsMessage);
};

export async function sendWebhookEventToWorkflowJobQueue(
  message: GithubWorkflowEvent,
  config: ConfigDispatcher,
): Promise<void> {
  if (!config.workflowJobEventSecondaryQueue) {
    return;
  }

  const sqs = new SQS({ region: process.env.AWS_REGION });
  const sqsMessage: SendMessageCommandInput = {
    QueueUrl: String(config.workflowJobEventSecondaryQueue),
    MessageBody: JSON.stringify(message),
  };

  logger.info(`Sending event to the workflow job queue: ${config.workflowJobEventSecondaryQueue}`);

  try {
    await sqs.sendMessage(sqsMessage);
  } catch (e) {
    logger.warn(`Error in sending webhook events to workflow job queue: ${(e as Error).message}`);
  }
}
