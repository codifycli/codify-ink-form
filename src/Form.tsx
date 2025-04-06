import { Box, Text, measureElement, useFocusManager, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';
import { FormProps } from './types.js';
import { FormHeader } from './FormHeader.js';
import { FormFieldRenderer } from './FormFieldRenderer.js';
import { DescriptionRenderer } from './DescriptionRenderer.js';
import { canSubmit } from './canSubmit.js';
import { SubmitButton } from './SubmitButton.js';
import { Button } from './Button.js';
import { ScrollArea } from './ScrollArea.js';
import { FullScreen, useStdoutDimensions } from './FullScreen.js';

export const Form: React.FC<FormProps> = props => {
  const isControlled = props.value !== undefined;
  const [currentTab, setCurrentTab] = useState(0);
  const [sections, setSections] = useState(props.form.sections);
  const form = { ...props.form, sections }
  const [value, setValue] = useState<Array<Record<string, unknown>>>(props.value ?? Array.from({ length: sections.length }, () => ({})));
  const [editingField, setEditingField] = useState<string>();
  const canSubmitForm = useMemo(() => canSubmit(form, value), [value, form]);
  const focusManager = useFocusManager();
  const [focusedElement, setFocusedElement] = useState(0); // this is -1 because there is no initial focus. The first down click will focus on element 0
  const headerRef = useRef();
  const headerHeight = headerRef.current ? measureElement(headerRef.current).height : 5
  const [, fullHeight] = useStdoutDimensions()

  useEffect(() => {
    focusManager.enableFocus();
    setTimeout(() => focusManager.focusNext(), 50)
  }, []);

  useEffect(() => {
    if (props.value) {
      setValue(props.value);
    }
  }, [props.value]);

  useEffect(() => {
    // Set initial values
    if (!isControlled) {
      props.form.sections.forEach((section, index) => {
        setValueAndPropagate(index, section.fields
          .map(field => (field.initialValue !== undefined ? { [field.name]: field.initialValue } : {}))
          .reduce((obj1, obj2) => ({ ...obj1, ...obj2 }), {}));
      })
    }
  }, []);

  const onFieldExit = (fieldName) => {
    const elementNum = sections[currentTab].fields.findIndex((f) => f.name === fieldName);
    focusManager.focus(`${elementNum}`)
    setFocusedElement(elementNum);
  }

  const onChangeTab = (tab: number) => {
    setCurrentTab(tab);
    setFocusedElement(0)
    setTimeout(() => focusManager.focusNext(), 50)
  }

  const setValueAndPropagate = (index: number, newValue: Record<string, unknown>) => {
    value[index] = newValue
    setValue(structuredClone(value));
    props.onChange?.(value);
  };

  const onSubmitForm = () => {
    const formattedValue = value.map((v, index) => ({
      section: sections[index],
      value: v
    }))

    props.onSubmit?.(formattedValue)
  }

  useInput(
    (input, key) => {
      if (key.upArrow) {
        if (focusedElement <= 0) {
          return;
        }

        setFocusedElement((focusedElement) => focusedElement - 1);
        focusManager.focusPrevious();
      } else if (key.downArrow) {
        // This calculates the maximum amount of children there is. We don't want to scroll past the last item
        // Fields.length is number of json fields. 2 is the add and remove buttons. Submit button is sometimes focusable
        const totalFocusableElements = sections[currentTab].fields.length + (canSubmitForm ? 1 : 0)
        if (focusedElement + 1 >= totalFocusableElements) {
          return;
        }

        setFocusedElement((focusedElement) => focusedElement + 1);
        focusManager.focusNext();
        return;
      }

      // When escape is pressed the focus is automatically reset. We have to handle that case or else the ordering gets messed up.
      if (key.escape) {
        focusManager.focus('0');
        setFocusedElement(0);
        return;
      }

      if (input === 'a') {
        duplicateCurrentSection();
        return;
      }

      if (input === 'r' && sections.length > 1) {
        removeCurrentSection();
      }

      if (input === 's' && canSubmitForm) {
        onSubmitForm();
      }
    },
    { isActive: !editingField }
  );

  const duplicateCurrentSection = () => {
    const newTabs = [...sections]
    newTabs.splice(currentTab + 1, 0, sections[currentTab])

    const newValue = { ...value[currentTab]};
    value.splice(currentTab + 1, 0, newValue);

    setSections(newTabs);
    setValue([...value]);
    onChangeTab(Math.min(currentTab + 1, newTabs.length - 1));
  }

  const removeCurrentSection = () => {
    const newTabs = [...sections]
    newTabs.splice(currentTab, 1);
    value.splice(currentTab, 1)

    setSections(newTabs);
    setValue([...value]);
    onChangeTab(Math.max(currentTab - 1, 0));
  }

  const upperFirstLetter = (s?: string): string | undefined => {
    if (!s) {
      return s;
    }
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <FullScreen>
      <Box width="100%" height="90%" flexDirection="column" overflowY="hidden">
        <FormHeader {...props} headerRef={headerRef} form={form} currentTab={currentTab} onChangeTab={onChangeTab} editingField={editingField} />
        <ScrollArea height={fullHeight - headerHeight} key={currentTab} isStart={focusedElement === -1} numFields={sections[currentTab].fields.length} editingMode={!!editingField}>
          <Box flexDirection='row'>
            <Box flexDirection='column' width='70%'>
              {!editingField && (
                <Box flexDirection='column'>
                  <Box marginLeft={1} marginTop={1}>
                    <Text bold>{sections[currentTab].title}</Text>
                  </Box>
                  <Text>{' {'}</Text>
                </Box>
              )}
              <Box flexDirection="column">
                {currentTab > sections.length - 1
                  ? null
                  : sections[currentTab].fields.map((field, index) => (
                    <FormFieldRenderer
                      id={`${index}`}
                      field={field}
                      key={field.name + currentTab}
                      form={form}
                      value={value[currentTab][field.name]}
                      onExit={onFieldExit}
                      onChange={v => setValueAndPropagate(currentTab, { ...value[currentTab], [field.name]: v })}
                      onSetEditingField={setEditingField}
                      editingField={editingField}
                      customManagers={props.customManagers}
                    />
                  ))}
                {!editingField && (
                  <Text>{' }'}</Text>
                )}
              </Box>
            </Box>
            <Box flexDirection="column" width="30%" >
              {
                !editingField && sections[currentTab].fields[focusedElement]?.description && (
                  <Box flexDirection="column">
                    <Text> </Text>
                    <Text underline>{upperFirstLetter(sections[currentTab].fields[focusedElement]?.label)}:</Text>
                    <DescriptionRenderer description={sections[currentTab].fields[focusedElement]?.description} />
                  </Box>
                )
              }
            </Box>

          </Box>
          {!editingField && (
            <Box flexDirection='column' marginTop={1}>
              <Box flexDirection="row">
                <SubmitButton canSubmit={canSubmitForm} onSubmit={onSubmitForm}/>
              </Box>
              <Text color='gray' dimColor> Up/down: navigate between parameters.</Text>
              <Text color='gray' dimColor> Left/right: navigate between resources.</Text>
              <Text color='gray' dimColor> Enter: select or edit.</Text>
              <Text color='gray' dimColor> [A]: add an additional instance.</Text>
              <Text color='gray' dimColor> [R]: remove import.</Text>
            </Box>

            // </Box>
          )}
        </ScrollArea>
      </Box>
    </FullScreen>

  );
};
