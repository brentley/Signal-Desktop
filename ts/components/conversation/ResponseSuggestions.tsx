// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect, useState, useCallback } from 'react';
import classNames from 'classnames';
import type { ResponseSuggestion } from '../../services/llmResponseSuggestions';
import { llmResponseSuggestionsService } from '../../services/llmResponseSuggestions';
import type { ConversationModel } from '../../models/conversations';
import type { LocalizerType } from '../../types/Util';
import { Spinner } from '../Spinner';

export type ResponseSuggestionsProps = {
  conversation: ConversationModel;
  onSelectSuggestion: (text: string) => void;
  i18n: LocalizerType;
};

type ErrorType = 'network' | 'api' | 'rate-limit' | 'invalid-response' | null;

export function ResponseSuggestions({
  conversation,
  onSelectSuggestion,
  i18n,
}: ResponseSuggestionsProps): JSX.Element | null {
  const [suggestions, setSuggestions] = useState<Array<ResponseSuggestion>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [error, setError] = useState<ErrorType>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // Check if the feature is enabled
  useEffect(() => {
    const checkEnabled = () => {
      const enabled = window.storage.get('llm-response-suggestions-enabled') ?? false;
      const apiKey = window.storage.get('llm-response-suggestions-api-key');
      setIsEnabled(enabled);
      setHasApiKey(!!apiKey);
    };

    checkEnabled();
    
    // Listen for storage changes
    const onStorageReady = () => {
      checkEnabled();
    };
    
    window.storage.onready(onStorageReady);
    
    return () => {
      // Clean up listener if needed
    };
  }, []);

  // Fetch suggestions when conversation changes
  useEffect(() => {
    if (!isEnabled || !hasApiKey) {
      return;
    }

    // Rate limiting: Don't fetch if we fetched in the last 30 seconds
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime;
    if (timeSinceLastFetch < 30000) {
      return;
    }

    let isCancelled = false;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setSuggestions([]);
      setError(null);

      try {
        const newSuggestions = await llmResponseSuggestionsService.getResponseSuggestions(
          conversation
        );
        
        if (!isCancelled) {
          setSuggestions(newSuggestions);
          setLastFetchTime(Date.now());
        }
      } catch (err) {
        if (!isCancelled) {
          setSuggestions([]);
          
          // Determine error type
          if (err instanceof Error) {
            if (err.message.includes('rate limit')) {
              setError('rate-limit');
            } else if (err.message.includes('network') || err.message.includes('fetch')) {
              setError('network');
            } else if (err.message.includes('API') || err.message.includes('401') || err.message.includes('403')) {
              setError('api');
            } else {
              setError('invalid-response');
            }
          } else {
            setError('invalid-response');
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSuggestions();

    return () => {
      isCancelled = true;
    };
  }, [conversation, isEnabled, hasApiKey, lastFetchTime]);

  const handleSelectSuggestion = useCallback(
    (suggestion: ResponseSuggestion) => {
      onSelectSuggestion(suggestion.text);
      // Clear suggestions after selection
      setSuggestions([]);
    },
    [onSelectSuggestion]
  );

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setSuggestions([]);
    setError(null);
    setLastFetchTime(0); // Reset rate limiting for manual refresh

    try {
      const newSuggestions = await llmResponseSuggestionsService.getResponseSuggestions(
        conversation
      );
      setSuggestions(newSuggestions);
      setLastFetchTime(Date.now());
    } catch (err) {
      setSuggestions([]);
      
      // Determine error type
      if (err instanceof Error) {
        if (err.message.includes('rate limit')) {
          setError('rate-limit');
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          setError('network');
        } else if (err.message.includes('API') || err.message.includes('401') || err.message.includes('403')) {
          setError('api');
        } else {
          setError('invalid-response');
        }
      } else {
        setError('invalid-response');
      }
    } finally {
      setIsLoading(false);
    }
  }, [conversation]);

  if (!isEnabled || !hasApiKey) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="ResponseSuggestions ResponseSuggestions--loading">
        <Spinner size="20px" svgSize="small" />
        <span className="ResponseSuggestions__loading-text">
          {i18n('icu:ResponseSuggestions--loading')}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ResponseSuggestions ResponseSuggestions--error">
        <span className="ResponseSuggestions__error-text">
          {error === 'rate-limit' && i18n('icu:ResponseSuggestions--error-rate-limit')}
          {error === 'network' && i18n('icu:ResponseSuggestions--error-network')}
          {error === 'api' && i18n('icu:ResponseSuggestions--error-api')}
          {error === 'invalid-response' && i18n('icu:ResponseSuggestions--error-invalid-response')}
        </span>
        <button
          type="button"
          className="ResponseSuggestions__retry"
          onClick={handleRefresh}
          aria-label={i18n('icu:ResponseSuggestions--retry')}
        >
          {i18n('icu:ResponseSuggestions--retry')}
        </button>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="ResponseSuggestions">
      <div className="ResponseSuggestions__header">
        <span className="ResponseSuggestions__title">
          {i18n('icu:ResponseSuggestions--title')}
        </span>
        <button
          type="button"
          className="ResponseSuggestions__refresh"
          onClick={handleRefresh}
          aria-label={i18n('icu:ResponseSuggestions--refresh')}
        >
          <span className="ResponseSuggestions__refresh-icon" />
        </button>
      </div>
      <div className="ResponseSuggestions__bubbles">
        {suggestions.map(suggestion => (
          <button
            key={suggestion.id}
            type="button"
            className="ResponseSuggestions__bubble"
            onClick={() => handleSelectSuggestion(suggestion)}
          >
            {suggestion.text}
          </button>
        ))}
      </div>
    </div>
  );
}