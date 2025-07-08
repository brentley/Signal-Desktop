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
    const isGroup = conversation.isGroupV1() || conversation.isGroupV2();
    
    // Build a map of participant names
    const participantNames = new Map<string, string>();
    
    // Sort messages by timestamp (oldest first)
    const sortedMessages = [...messages].sort((a, b) => {
      const aTime = a.sent_at || a.received_at || 0;
      const bTime = b.sent_at || b.received_at || 0;
      return aTime - bTime;
    });

    let formattedMessages = '';
    let tokenEstimate = 0;
    const maxTokens = 2000; // Leave room for system prompt and response
    
    // Add conversation context
    if (isGroup) {
      const groupName = conversation.getTitle();
      const memberCount = conversation.get('membersV2')?.length || 0;
      formattedMessages += `[Group Chat: "${groupName}" with ${memberCount} members]\n\n`;
    } else {
      const contactName = conversation.getTitle();
      formattedMessages += `[Direct conversation with ${contactName}]\n\n`;
    }
    
    // Build chat history, tracking individual senders
    for (const msg of sortedMessages) {
      const senderId = msg.source || msg.sourceServiceId;
      const isFromMe = senderId === ourId;
      
      let senderName: string;
      if (isFromMe) {
        senderName = 'Me';
      } else if (isGroup && senderId) {
        // Get or cache the sender's name
        if (!participantNames.has(senderId)) {
          const contact = window.ConversationController.get(senderId);
          const name = contact ? contact.getTitle() : 'Unknown';
          participantNames.set(senderId, name);
        }
        senderName = participantNames.get(senderId) || 'Unknown';
      } else {
        // Direct message - use conversation title
        senderName = conversation.getTitle();
      }
      
      // Handle different message types
      let content: string;
      if (msg.deletedForEveryone) {
        content = '[Message deleted]';
      } else if (msg.body) {
        content = msg.body;
        // Add edit indicator if message was edited
        if (msg.editHistory && msg.editHistory.length > 0) {
          content += ' (edited)';
        }
      } else if (msg.sticker) {
        content = '[Sticker]';
      } else if (msg.attachments && msg.attachments.length > 0) {
        const types = msg.attachments.map(att => {
          if (att.contentType?.startsWith('image/')) return 'Photo';
          if (att.contentType?.startsWith('video/')) return 'Video';
          if (att.contentType?.startsWith('audio/')) return 'Audio';
          return 'File';
        });
        content = `[${types.join(', ')}]`;
      } else {
        content = '[No text]';
      }
      
      // Add reactions if any
      let reactions = '';
      if (msg.reactions && msg.reactions.length > 0) {
        const reactionEmojis = msg.reactions.map(r => r.emoji).join('');
        reactions = ` [Reactions: ${reactionEmojis}]`;
      }
      
      const line = `${senderName}: ${content}${reactions}\n`;
      
      // Rough token estimate (1 token ≈ 4 characters)
      const lineTokens = Math.ceil(line.length / 4);
      if (tokenEstimate + lineTokens > maxTokens) {
        break;
      }
      
      formattedMessages += line;
      tokenEstimate += lineTokens;
    }

    // Add participant summary for groups
    if (isGroup && participantNames.size > 0) {
      const participants = Array.from(participantNames.values()).join(', ');
      formattedMessages += `\n[Active participants in this conversation: Me, ${participants}]`;
    }

    return formattedMessages.trim();
  }

  private async callLLMAPI(
    apiUrl: string,
    apiKey: string,
    chatHistory: string,
    endpointType: 'openai' | 'custom' | undefined
  ): Promise<Array<ResponseSuggestion>> {
    const systemPrompt = `You are a helpful assistant that suggests personalized message responses based on chat history. 

Instructions:
1. Analyze how "Me" writes - their style, tone, vocabulary, and typical responses
2. Consider the conversation context:
   - Is this a group chat or direct message?
   - Who are the participants?
   - What's the current topic or flow of conversation?
3. Suggest 3 different responses that:
   - Sound authentically like "Me" based on their previous messages
   - Are appropriate continuations of the conversation
   - Vary in tone/approach (e.g., one friendly, one humorous, one practical)
   - Are concise and conversational
   - Fit the relationship dynamics shown in the chat

For group chats, consider:
- Who "Me" typically responds to
- The group's communication style
- Whether to address someone specific or the group

Return ONLY a JSON array with exactly 3 suggested responses, no other text.
Example format: ["Response 1", "Response 2", "Response 3"]`;

    const userPrompt = `Based on this chat history, suggest 3 responses that I might send next:\n\n${chatHistory}`;

    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('rate limit exceeded');
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('API authentication failed');
        }
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
      
      // Handle different error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('network timeout');
        }
        if (error.message.includes('network') || error.message.includes('fetch')) {
          throw new Error('network error');
        }
      }
      
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