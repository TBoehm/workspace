// also exported from '@storybook/react' if you can deal with breaking changes in 6.1
import { Meta, Story } from '@storybook/react/types-6-0';
import React from 'react';
import { DateRangePicker } from './index';

export default {
  title: 'Emissions Dashboard / Components / DateRangePicker',
  component: DateRangePicker,
} as Meta;

const Template: Story = (args) => <DateRangePicker {...args} />;

const updateDates = (startDate: Date, endDate: Date): void => {};

export const Primary = Template.bind({});
Primary.args = {
  updateDates,
  startDate: new Date('2021/06/15'),
  endDate: new Date(),
};
