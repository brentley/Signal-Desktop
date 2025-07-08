// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ConversationModel } from '../models/conversations';
import type { MessageAttributesType } from '../model-types';
import { isNotNil } from '../util/isNotNil';
import * as log from '../logging/log';
import { HTTPError } from '../textsecure/Errors';

export type LLMResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

export type ResponseSuggestion = {
  text: string;
  id: string;
};

export class LLMResponseSuggestionsService {
  private static instance: LLMResponseSuggestionsService | undefined;

  static getInstance(): LLMResponseSuggestionsService {
    if (!LLMResponseSuggestionsService.instance) {
      LLMResponseSuggestionsService.instance = new LLMResponseSuggestionsService();
    }
    return LLMResponseSuggestionsService.instance;
  }

  async getResponseSuggestions(
    conversation: ConversationModel
  ): Promise<Array<ResponseSuggestion>> {
    const isEnabled = window.storage.get('llm-response-suggestions-enabled');
    const endpointType = window.storage.get('llm-response-suggestions-endpoint-type') || 'openai';
    const customUrl = window.storage.get('llm-response-suggestions-url');
    const apiKey = window.storage.get('llm-response-suggestions-api-key');

    if (!isEnabled || !apiKey) {
      return [];
    }

    // Determine the API URL based on endpoint type
    const apiUrl = endpointType === 'openai' 
      ? 'https://api.openai.com/v1/chat/completions'
      : customUrl;

    if (!apiUrl) {
      return [];
    }

    try {
      // Get recent messages from the conversation
      const messages = await this.getRecentMessages(conversation);
      
      if (messages.length === 0) {
        return [];
      }

      // Format the chat history for the LLM
      const chatHistory = this.formatChatHistory(messages, conversation);
      
      // Call the LLM API
      const suggestions = await this.callLLMAPI(apiUrl, apiKey, chatHistory, endpointType);
      
      return suggestions;
    } catch (error) {
      log.error('LLMResponseSuggestionsService: Error getting suggestions', error);
      return [];
    }
  }

  private async getRecentMessages(
    conversation: ConversationModel
  ): Promise<Array<MessageAttributesType>> {
    // Get the most recent 50 messages or messages from the last 24 hours
    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - DAY_IN_MS;
    
    const messages = await window.Signal.Data.getOlderMessagesByConversation({
      conversationId: conversation.id,
      includeStoryReplies: false,
      limit: 50,
      messageId: undefined,
      receivedAt: undefined,
      sentAt: undefined,
      storyId: undefined,
    });

    // Filter to only include messages from the last 24 hours
    const recentMessages = messages.filter(msg => {
      const timestamp = msg.sent_at || msg.received_at;
      return timestamp && timestamp > cutoffTime;
    });

    // Return the most recent messages (up to 50)
    return recentMessages.slice(0, 50);
  }

  private formatChatHistory(
    messages: Array<MessageAttributesType>,
    conversation: ConversationModel
  ): string {
    const ourId = window.ConversationController.getOurConversationIdOrThrow();
    const conversationTitle = conversation.getTitle();
    
    // Sort messages by timestamp (oldest first)
    const sortedMessages = [...messages].sort((a, b) => {
      const aTime = a.sent_at || a.received_at || 0;
      const bTime = b.sent_at || b.received_at || 0;
      return aTime - bTime;
    });

    const formattedMessages = sortedMessages
      .map(msg => {
        const isFromMe = msg.source === ourId || msg.sourceServiceId === ourId;
        const sender = isFromMe ? 'Me' : conversationTitle;
        const body = msg.body || '[No text]';
        return `${sender}: ${body}`;
      })
      .join('\n');

    return formattedMessages;
  }

  private async callLLMAPI(
    apiUrl: string,
    apiKey: string,
    chatHistory: string,
    endpointType: 'openai' | 'custom' | undefined
  ): Promise<Array<ResponseSuggestion>> {
    const systemPrompt = `You are a helpful assistant that suggests personalized message responses based on chat history. 
Analyze the conversation and suggest 3 different responses that sound like "Me" based on their writing style, tone, and typical responses.
The suggestions should be natural continuations of the conversation.
Keep responses concise and conversational.
Return ONLY a JSON array with exactly 3 suggested responses, no other text.
Example format: ["Response 1", "Response 2", "Response 3"]`;

    const userPrompt = `Based on this chat history, suggest 3 responses that I might send next:\n\n${chatHistory}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: endpointType === 'openai' ? 'gpt-4-turbo-preview' : 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        throw new HTTPError('LLM API request failed', {
          code: response.status,
          headers: {},
        });
      }

      const data = await response.json() as LLMResponse;
      
      if (!data.choices || data.choices.length === 0) {
        return [];
      }

      // Parse the response
      const content = data.choices[0].message.content;
      let suggestions: string[] = [];
      
      try {
        suggestions = JSON.parse(content);
      } catch (parseError) {
        // If JSON parsing fails, try to extract suggestions from the text
        log.warn('LLMResponseSuggestionsService: Failed to parse JSON response, attempting text extraction');
        suggestions = this.extractSuggestionsFromText(content);
      }

      // Ensure we have exactly 3 suggestions
      suggestions = suggestions.slice(0, 3);
      while (suggestions.length < 3) {
        suggestions.push('');
      }

      return suggestions
        .filter(text => text && text.trim().length > 0)
        .map((text, index) => ({
          text: text.trim(),
          id: `suggestion-${Date.now()}-${index}`,
        }));
    } catch (error) {
      log.error('LLMResponseSuggestionsService: API call failed', error);
      throw error;
    }
  }

  private extractSuggestionsFromText(text: string): string[] {
    // Try to extract suggestions from various formats
    const lines = text.split('\n').filter(line => line.trim());
    
    // Look for numbered lists (1. 2. 3.) or bullet points
    const suggestions: string[] = [];
    for (const line of lines) {
      const match = line.match(/^(?:\d+\.|[-*•])\s*(.+)$/);
      if (match) {
        suggestions.push(match[1].trim());
      }
    }

    if (suggestions.length > 0) {
      return suggestions;
    }

    // If no formatted list found, just return the first 3 non-empty lines
    return lines.slice(0, 3);
  }
}

export const llmResponseSuggestionsService = LLMResponseSuggestionsService.getInstance();