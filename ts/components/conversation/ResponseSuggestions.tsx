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

export function ResponseSuggestions({
  conversation,
  onSelectSuggestion,
  i18n,
}: ResponseSuggestionsProps): JSX.Element | null {
  const [suggestions, setSuggestions] = useState<Array<ResponseSuggestion>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  // Check if the feature is enabled
  useEffect(() => {
    const checkEnabled = () => {
      const enabled = window.storage.get('llm-response-suggestions-enabled') ?? false;
      setIsEnabled(enabled);
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
    if (!isEnabled) {
      return;
    }

    let isCancelled = false;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setSuggestions([]);

      try {
        const newSuggestions = await llmResponseSuggestionsService.getResponseSuggestions(
          conversation
        );
        
        if (!isCancelled) {
          setSuggestions(newSuggestions);
        }
      } catch (error) {
        // Error is already logged in the service
        if (!isCancelled) {
          setSuggestions([]);
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
  }, [conversation, isEnabled]);

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

    try {
      const newSuggestions = await llmResponseSuggestionsService.getResponseSuggestions(
        conversation
      );
      setSuggestions(newSuggestions);
    } catch (error) {
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversation]);

  if (!isEnabled) {
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